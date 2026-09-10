"""Medication Name Aliases — AI-assisted cleanup + suggestions.

Three endpoints:
  - GET  /name-suggestions     (auth)    : Top drug names for /care chip suggestions. Cached 5min.
  - POST /ai-suggest-aliases   (admin)   : Read top-N free-text custom_name, ask Claude API to group.
  - POST /apply-aliases        (admin)   : Insert approved aliases, optionally bulk-update care_medications.

Created 2026-08-22 to combat the data-quality problem of free-text medication names
producing typo-driven duplicates (e.g. "Vitamin C", "vitamin c  ", "Vitamiin C").
"""
import json
import logging
import re
import time
import unicodedata
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.server.auth import require_auth, require_admin
from src.services.database.db import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/farm/medication-aliases",
                   tags=["medication-aliases"])

# Module-level cache (5-min TTL) — pattern borrowed from src/iot/mq_tare_service.py
_NAME_SUGGESTIONS_CACHE = {"data": None, "expires_at": 0.0}
_NAME_SUGGESTIONS_TTL = 300  # seconds


def _invalidate_suggestions_cache():
    _NAME_SUGGESTIONS_CACHE["data"] = None
    _NAME_SUGGESTIONS_CACHE["expires_at"] = 0.0


# ── Text matching helpers (Layer 1 — used by /resolve endpoint) ──────


def _normalize_text(s: str) -> str:
    """Lowercase, strip Vietnamese diacritics, collapse whitespace."""
    if not s:
        return ""
    nfd = unicodedata.normalize('NFD', s.lower())
    stripped = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')
    return ' '.join(stripped.split())


def _levenshtein(a: str, b: str) -> int:
    """Standard Wagner-Fischer, O(n*m) — fine for short medication names."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        cur = [i + 1]
        for j, cb in enumerate(b):
            cur.append(min(cur[-1] + 1, prev[j + 1] + 1, prev[j] + (ca != cb)))
        prev = cur
    return prev[-1]


def _token_jaccard(a: str, b: str) -> float:
    """Jaccard similarity on whitespace-separated tokens (for compound names)."""
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


@router.get("/name-suggestions", dependencies=[Depends(require_auth)])
async def name_suggestions(limit: int = 20):
    """Top drug names for /care chip suggestions. Cached 5min, invalidated on POST."""
    now = time.time()
    cached = _NAME_SUGGESTIONS_CACHE["data"]
    if cached and now < _NAME_SUGGESTIONS_CACHE["expires_at"]:
        return cached[:limit]

    rows = await db.fetch("""
        SELECT m.id AS medication_id,
               m.name AS canonical_name,
               m.unit AS unit,
               m.category AS category,
               COUNT(*) AS usage_count,
               MAX(cm.med_date) AS last_used
        FROM care_medications cm
        JOIN medications m ON m.id = cm.medication_id
        WHERE cm.medication_id IS NOT NULL
          AND m.status = 'active'
        GROUP BY m.id, m.name, m.unit, m.category
        ORDER BY usage_count DESC, last_used DESC
        LIMIT $1
    """, limit)

    # Include approved aliases as additional canonical-ish entries (low priority)
    alias_rows = await db.fetch("""
        SELECT mna.canonical_medication_id, mna.alias_name, m.name AS canonical_name,
               m.unit AS unit, m.category AS category
        FROM medication_name_aliases mna
        JOIN medications m ON m.id = mna.canonical_medication_id
        WHERE mna.approved_by IS NOT NULL
    """)

    data = [dict(r) for r in rows]
    # Dedupe canonical names; merge alias info
    seen = {r["canonical_name"].lower() for r in data}
    for ar in alias_rows:
        cn = dict(ar)
        if cn["canonical_name"].lower() not in seen:
            cn["usage_count"] = 0
            cn["last_used"] = None
            data.append(cn)

    _NAME_SUGGESTIONS_CACHE["data"] = data
    _NAME_SUGGESTIONS_CACHE["expires_at"] = now + _NAME_SUGGESTIONS_TTL
    return data[:limit]


class SuggestRequest(BaseModel):
    max_distinct: Optional[int] = 100
    min_usage_count: Optional[int] = 2


class ResolveRequest(BaseModel):
    text: str
    limit: Optional[int] = 3


@router.post("/resolve", dependencies=[Depends(require_auth)])
async def resolve_medication_name(req: ResolveRequest):
    """Return exact alias match + top-N fuzzy suggestions for typed text.

    Order: alias exact → catalog Levenshtein ≤ 2 → token Jaccard ≥ 0.6.
    Per-keystroke; not cached (cache lives on /name-suggestions only).
    """
    txt = (req.text or "").strip()
    if len(txt) < 3:
        return {"exact": None, "suggestions": []}

    # 1. Exact alias match (case-insensitive, trimmed)
    alias = await db.fetchrow("""
        SELECT mna.canonical_medication_id, m.name AS canonical_name,
               m.unit, m.category
        FROM medication_name_aliases mna
        JOIN medications m ON m.id = mna.canonical_medication_id
        WHERE LOWER(TRIM(mna.alias_name)) = LOWER($1)
          AND mna.approved_by IS NOT NULL
        LIMIT 1
    """, txt)

    # 2. Pull active catalog for fuzzy scoring
    catalog = await db.fetch("""
        SELECT id, name, unit, category
        FROM medications WHERE status = 'active'
    """)

    norm = _normalize_text(txt)
    scored = []
    for m in catalog:
        cname = m["name"]
        d = _levenshtein(norm, _normalize_text(cname))
        if d <= 2:
            scored.append({
                "medication_id": m["id"],
                "canonical_name": cname,
                "unit": m["unit"],
                "category": m["category"],
                "score": 1.0 - (d * 0.25),  # d=0 → 1.0, d=2 → 0.5
                "reason": "fuzzy",
            })
        else:
            # Token overlap (Jaccard) for compound names like "Vitamin C 500mg"
            tok_score = _token_jaccard(norm, _normalize_text(cname))
            if tok_score >= 0.6:
                scored.append({
                    "medication_id": m["id"],
                    "canonical_name": cname,
                    "unit": m["unit"],
                    "category": m["category"],
                    "score": tok_score * 0.8,
                    "reason": "token",
                })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:req.limit]

    return {
        "exact": {
            "medication_id": alias["canonical_medication_id"],
            "canonical_name": alias["canonical_name"],
            "unit": alias["unit"],
            "category": alias["category"],
        } if alias else None,
        "suggestions": top,
    }


class SuggestRequest(BaseModel):
    max_distinct: Optional[int] = 100
    min_usage_count: Optional[int] = 2


@router.post("/ai-suggest-aliases", dependencies=[Depends(require_admin)])
async def ai_suggest_aliases(req: SuggestRequest):
    """Read top-N free-text custom_name, ask Anthropic API to group them.

    Filters to usage_count >= min_usage_count to skip low-signal singletons.
    """
    distinct = await db.fetch("""
        SELECT custom_name, COUNT(*) AS usage_count
        FROM care_medications
        WHERE custom_name IS NOT NULL
          AND LENGTH(TRIM(custom_name)) > 0
          AND medication_id IS NULL          -- only free-text entries (not catalog-linked)
        GROUP BY custom_name
        HAVING COUNT(*) >= $1
        ORDER BY usage_count DESC
        LIMIT $2
    """, req.min_usage_count, req.max_distinct)

    catalog = await db.fetch("""
        SELECT id, name, unit, category
        FROM medications
        WHERE status = 'active'
        ORDER BY name
    """)

    if not distinct:
        return {"groups": [], "message": "Không có custom_name free-text nào đủ điều kiện."}

    # Reuse Anthropic client pattern from src/server/routes/chat.py:86-98
    import os
    from anthropic import Anthropic

    api_key = os.environ.get("ANTHROPIC_AUTH_TOKEN")
    if not api_key:
        return {"groups": [], "message": "ANTHROPIC_AUTH_TOKEN chưa cấu hình trên server."}

    base_url = os.environ.get("ANTHROPIC_BASE_URL", "https://api.minimax.io/anthropic")
    client = Anthropic(api_key=api_key, base_url=base_url)

    prompt = _build_prompt(distinct, catalog)
    try:
        resp = client.messages.create(
            model=os.environ.get("ANTHROPIC_MODEL", "MiniMax-M2.7"),
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        logger.error("AI suggest-aliases Anthropic call failed: %s", e)
        return {"groups": [], "message": f"AI call thất bại: {e}"}

    raw_text = next((b.text for b in resp.content if hasattr(b, "text")), "")
    groups = _parse_ai_response(raw_text, catalog)

    return {
        "groups": groups,
        "message": f"AI đã phân tích {len(distinct)} tên free-text. Admin xem và duyệt bên dưới."
    }


class ApplyAliasesRequest(BaseModel):
    items: list[dict]            # [{alias_name, canonical_medication_id, approved: bool}]
    update_existing: bool = True # bulk-UPDATE care_medications.medication_id for matched rows


@router.post("/apply-aliases", dependencies=[Depends(require_admin)])
async def apply_aliases(req: ApplyAliasesRequest, user: dict = Depends(require_admin)):
    """Insert approved aliases, optionally bulk-update care_medications rows."""
    approved = [i for i in req.items if i.get("approved")]
    if not approved:
        return {"inserted": 0, "updated_rows": 0, "message": "Không có alias nào được duyệt."}

    user_id = user["id"]
    inserted_count = 0
    updated_rows = 0
    async with db.transaction() as conn:
        for item in approved:
            alias = item["alias_name"].strip()
            canon_id = item["canonical_medication_id"]
            row = await conn.fetchrow("""
                INSERT INTO medication_name_aliases
                    (alias_name, canonical_medication_id, approved_by, auto_generated)
                VALUES ($1, $2, $3, TRUE)
                ON CONFLICT (alias_name) DO UPDATE
                    SET canonical_medication_id = EXCLUDED.canonical_medication_id,
                        approved_by = EXCLUDED.approved_by,
                        auto_generated = TRUE
                RETURNING id
            """, alias, canon_id, user_id)
            if row:
                inserted_count += 1

            if req.update_existing:
                # Look up canonical name once
                canon_name = await conn.fetchval(
                    "SELECT name FROM medications WHERE id = $1", canon_id
                )
                r = await conn.execute("""
                    UPDATE care_medications
                    SET medication_id = $1, medication_name = $2
                    WHERE custom_name = $3 AND medication_id IS NULL
                """, canon_id, canon_name, alias)
                # parse asyncpg result string "... N rows" → count
                try:
                    updated_rows += int(r.rsplit(" ", 1)[-1])
                except (ValueError, AttributeError):
                    pass

    # Invalidate suggestions cache so /care sees new aliases
    _invalidate_suggestions_cache()

    return {
        "inserted": inserted_count,
        "updated_rows": updated_rows,
        "message": f"Đã lưu {inserted_count} alias, cập nhật {updated_rows} phiếu cũ."
    }


@router.get("/free-text-names", dependencies=[Depends(require_admin)])
async def free_text_names(limit: int = 500):
    """Distinct custom_name from care_medications, with alias assignment status.

    Admin uses this for manual cleanup — see all the raw free-text strings
    users have logged, plus which ones are already mapped to a canonical medication.
    """
    rows = await db.fetch("""
        SELECT
            cm.custom_name AS name,
            COUNT(*) AS usage_count,
            MAX(cm.med_date) AS last_used,
            SUM(CASE WHEN cm.medication_id IS NULL THEN 1 ELSE 0 END) AS unassigned_rows,
            SUM(CASE WHEN cm.medication_id IS NOT NULL THEN 1 ELSE 0 END) AS assigned_rows,
            mna.id AS alias_id,
            mna.canonical_medication_id,
            m.name AS canonical_name,
            mna.auto_generated,
            mna.approved_by,
            mna.created_at AS alias_created_at
        FROM care_medications cm
        LEFT JOIN medication_name_aliases mna
            ON LOWER(TRIM(mna.alias_name)) = LOWER(TRIM(cm.custom_name))
        LEFT JOIN medications m
            ON m.id = mna.canonical_medication_id
        WHERE cm.custom_name IS NOT NULL
          AND LENGTH(TRIM(cm.custom_name)) > 0
        GROUP BY
            cm.custom_name,
            mna.id,
            mna.canonical_medication_id,
            m.name,
            mna.auto_generated,
            mna.approved_by,
            mna.created_at
        ORDER BY usage_count DESC, MAX(cm.med_date) DESC
        LIMIT $1
    """, limit)
    return [dict(r) for r in rows]


@router.delete("/aliases/{alias_name}", dependencies=[Depends(require_admin)])
async def delete_alias(alias_name: str):
    """Remove an alias and reset care_medications rows that were updated by it.

    After deletion, those rows go back to medication_id=NULL (free-text) — they
    can be re-canonicalized by a new alias assignment later.
    """
    alias = alias_name.strip()
    if not alias:
        return {"deleted": 0, "reset_rows": 0, "message": "alias_name rỗng."}

    deleted_count = 0
    reset_rows = 0
    async with db.transaction() as conn:
        row = await conn.fetchrow(
            "DELETE FROM medication_name_aliases WHERE LOWER(TRIM(alias_name)) = LOWER(TRIM($1)) RETURNING id",
            alias,
        )
        if row:
            deleted_count = 1
            # Reset care_medications rows that point at this alias name
            r = await conn.execute("""
                UPDATE care_medications
                SET medication_id = NULL,
                    medication_name = ''
                WHERE custom_name = $1
                  AND medication_id IS NOT NULL
            """, alias)
            try:
                reset_rows = int(r.rsplit(" ", 1)[-1])
            except (ValueError, AttributeError):
                pass

    _invalidate_suggestions_cache()

    return {
        "deleted": deleted_count,
        "reset_rows": reset_rows,
        "message": f"Đã xóa alias '{alias}', reset {reset_rows} phiếu về free-text."
    }


# ── Auto-suggest NEW catalog entries from repeated free-text names ──


@router.get("/auto-suggest-catalog", dependencies=[Depends(require_admin)])
async def auto_suggest_catalog(min_usage: int = 2, limit: int = 50):
    """Suggest NEW medications to add to the catalog based on repeated free-text usage.

    For each distinct custom_name with usage_count >= min_usage that:
    - Is NOT already in the medications catalog (no Levenshtein ≤ 2 match)
    - Is NOT already aliased to a canonical medication
    ...return a pre-filled suggestion with:
    - canonical_name (most common variant)
    - unit, category (most common from care_medications logs)
    - variants (list of all distinct spellings)
    - usage_count, first_seen, last_seen
    """
    # Pull repeated free-text names with usage >= threshold
    distinct = await db.fetch("""
        SELECT
            custom_name,
            COUNT(*) AS usage_count,
            MAX(med_date) AS last_used,
            MIN(med_date) AS first_used,
            MODE() WITHIN GROUP (ORDER BY unit) AS unit,
            MODE() WITHIN GROUP (ORDER BY med_type) AS category
        FROM care_medications
        WHERE custom_name IS NOT NULL
          AND LENGTH(TRIM(custom_name)) > 0
          AND medication_id IS NULL
        GROUP BY custom_name
        HAVING COUNT(*) >= $1
        ORDER BY usage_count DESC, MAX(med_date) DESC
        LIMIT $2 * 3
    """, min_usage, limit)

    if not distinct:
        return {"suggestions": [], "message": "Chưa có tên free-text nào đủ điều kiện."}

    # Pull catalog + approved aliases for exclusion check
    catalog = await db.fetch("SELECT id, name FROM medications WHERE status = 'active'")
    aliases = await db.fetch("""
        SELECT LOWER(TRIM(alias_name)) AS alias_name
        FROM medication_name_aliases
        WHERE approved_by IS NOT NULL
    """)
    alias_set = {a["alias_name"] for a in aliases}

    suggestions = []
    seen_groups = set()  # group-key to dedupe variants

    for r in distinct:
        name = r["custom_name"].strip()
        norm = _normalize_text(name)
        if not norm or norm in seen_groups:
            continue

        # Skip if already aliased
        if norm in alias_set:
            continue

        # Skip if fuzzy-matched to existing catalog (Levenshtein ≤ 2)
        already_catalogued = False
        for c in catalog:
            if _levenshtein(norm, _normalize_text(c["name"])) <= 2:
                already_catalogued = True
                break
        if already_catalogued:
            continue

        # Group all variants with same normalized form
        variants_rows = await db.fetch("""
            SELECT DISTINCT custom_name
            FROM care_medications
            WHERE LOWER(TRIM(custom_name)) = LOWER($1)
              AND medication_id IS NULL
              AND LENGTH(TRIM(custom_name)) > 0
        """, name)

        # Pick the most "canonical-looking" name as canonical: longest distinct one
        # (heuristic — admin can edit before saving)
        variants = sorted({v["custom_name"].strip() for v in variants_rows},
                          key=lambda s: (-len(s), s.lower()))
        canonical_name = variants[0]

        seen_groups.add(norm)
        suggestions.append({
            "canonical_name": canonical_name,
            "unit": r["unit"],
            "category": r["category"],
            "usage_count": r["usage_count"],
            "variants": variants,
            "first_seen": r["first_used"].isoformat() if r.get("first_used") else None,
            "last_seen": r["last_used"].isoformat() if r.get("last_used") else None,
        })

        if len(suggestions) >= limit:
            break

    return {
        "suggestions": suggestions,
        "message": f"Tìm thấy {len(suggestions)} tên free-text lặp lại chưa có trong danh mục."
    }


class CreateFromFreetextRequest(BaseModel):
    canonical_name: str
    unit: Optional[str] = None
    category: Optional[str] = None
    variants: list[str] = []      # other custom_names to also alias
    update_existing: bool = True  # bulk-UPDATE care_medications rows


@router.post("/create-from-freetext", dependencies=[Depends(require_admin)])
async def create_from_freetext(req: CreateFromFreetextRequest, user: dict = Depends(require_admin)):
    """Create a new catalog medication from a free-text suggestion, plus aliases for variants.

    Atomic flow inside one transaction:
      1. INSERT into medications (status='active')
      2. INSERT one alias per variant (the canonical name itself + each spelling variant)
      3. Optionally UPDATE care_medications.medication_id for matched rows

    Returns the new medication + count of aliases created + rows updated.
    """
    canonical = (req.canonical_name or "").strip()
    if not canonical:
        return {"ok": False, "message": "Tên thuốc (canonical_name) bắt buộc."}
    if len(canonical) > 200:
        return {"ok": False, "message": "Tên thuốc quá dài (tối đa 200 ký tự)."}

    # Guard against duplicate name
    existing = await db.fetchval(
        "SELECT id FROM medications WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1",
        canonical,
    )
    if existing:
        return {"ok": False, "message": f"Tên '{canonical}' đã có trong danh mục (id={existing})."}

    user_id = user["id"]
    new_med_id = None
    alias_count = 0
    updated_rows = 0

    async with db.transaction() as conn:
        # 1. Create the catalog entry
        row = await conn.fetchrow("""
            INSERT INTO medications
                (name, unit, category, status)
            VALUES ($1, $2, $3, 'active')
            RETURNING id
        """, canonical, req.unit, req.category)
        new_med_id = row["id"]

        # 2. Build the alias set: canonical itself + all variants
        alias_set = {canonical}
        for v in (req.variants or []):
            v_clean = (v or "").strip()
            if v_clean:
                alias_set.add(v_clean)

        # Remove duplicates against existing aliases
        for alias in alias_set:
            ar = await conn.fetchrow("""
                INSERT INTO medication_name_aliases
                    (alias_name, canonical_medication_id, approved_by, auto_generated)
                VALUES ($1, $2, $3, TRUE)
                ON CONFLICT (alias_name) DO UPDATE
                    SET canonical_medication_id = EXCLUDED.canonical_medication_id,
                        approved_by = EXCLUDED.approved_by,
                        auto_generated = TRUE
                RETURNING id
            """, alias, new_med_id, user_id)
            if ar:
                alias_count += 1

            # 3. Optionally backfill care_medications rows
            if req.update_existing:
                r = await conn.execute("""
                    UPDATE care_medications
                    SET medication_id = $1, medication_name = $2
                    WHERE custom_name = $3 AND medication_id IS NULL
                """, new_med_id, canonical, alias)
                try:
                    updated_rows += int(r.rsplit(" ", 1)[-1])
                except (ValueError, AttributeError):
                    pass

    _invalidate_suggestions_cache()

    return {
        "ok": True,
        "medication_id": new_med_id,
        "canonical_name": canonical,
        "aliases_created": alias_count,
        "rows_updated": updated_rows,
        "message": f"Đã tạo '{canonical}' (id={new_med_id}), {alias_count} alias, cập nhật {updated_rows} phiếu cũ."
    }


def _build_prompt(distinct, catalog) -> str:
    """Build the AI prompt — Vietnamese context, JSON-only output."""
    free_text_lines = "\n".join(
        f'- "{r["custom_name"]}" ({r["usage_count"]} lần)'
        for r in distinct
    )
    catalog_lines = "\n".join(
        f'- id={r["id"]}: "{r["name"]}" [{r["category"] or "khác"}, {r["unit"] or ""}]'
        for r in catalog
    )
    return f"""Bạn là trợ lý AI cho hệ thống quản lý trang trại CFarm (chăn nuôi gà ở Việt Nam).

Nhiệm vụ: Gom nhóm các tên thuốc thú y do người dùng gõ tay (có thể sai chính tả) mà ý nghĩa TRÙNG với MỘT thuốc trong danh mục chuẩn.

QUY TẮC:
- Mỗi tên free-text chỉ được gom VÀO TỐI ĐA 1 nhóm.
- CHỈ gom khi CHẮC CHẮN cùng 1 hoạt chất/dạng bào chế/công dụng (VD: "Vitamin C" và "vit C 500mg" cùng nhóm; "Amoxicillin" và "Ampicillin" KHÁC nhóm — KHÔNG gom).
- Không chắc chắn → bỏ qua (không liệt kê).
- "confidence" từ 0.0 (đoán) đến 1.0 (chắc chắn). Chỉ xuất các nhóm có confidence ≥ 0.75.
- Chỉ sử dụng canonical_medication_id có trong danh sách catalog dưới đây.

=== DANH MỤC THUỐC CHUẨN ({len(catalog)} mục) ===
{catalog_lines}

=== TÊN DO NGƯỜI DÙNG GÕ ({len(distinct)} mục) ===
{free_text_lines}

=== OUTPUT ===
Trả về JSON thuần (KHÔNG kèm ```json``` hay giải thích), đúng format:
[
  {{
    "aliases": ["ten free text 1", "ten free text 2"],
    "canonical_medication_id": 15,
    "confidence": 0.92,
    "reason": "Cùng hoạt chất Vitamin C"
  }}
]

Nếu không tìm được nhóm nào đủ tin cậy → trả về [].
"""


def _parse_ai_response(raw_text, catalog) -> list:
    """Robustly extract JSON array from Claude response."""
    # Strip code fences if any
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text.strip(), flags=re.MULTILINE)
    # Find first [...] block
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        return []
    try:
        parsed = json.loads(m.group(0))
        valid_ids = {r["id"] for r in catalog}
        groups = []
        for g in parsed:
            if not isinstance(g, dict):
                continue
            if g.get("canonical_medication_id") not in valid_ids:
                continue
            if g.get("confidence", 0) < 0.75:
                continue
            groups.append({
                "aliases": g.get("aliases", []),
                "canonical_medication_id": g["canonical_medication_id"],
                "canonical_name": next(
                    (r["name"] for r in catalog if r["id"] == g["canonical_medication_id"]),
                    "?"
                ),
                "confidence": float(g.get("confidence", 0)),
                "reason": g.get("reason", ""),
            })
        return groups
    except Exception as e:
        logger.warning("AI response parse failed: %s — raw: %s", e, raw_text[:200])
        return []
