-- Split dataset into train/val sets (80/20)
-- Run this after labeling and verifying images

-- Add split column if not exists
ALTER TABLE ml_dataset_images ADD COLUMN IF NOT EXISTS split VARCHAR(10) DEFAULT 'train';

-- Split verified images: 80% train, 20% val
-- Update all to train first
UPDATE ml_dataset_images SET split = 'train' WHERE label_status IN ('labeled', 'verified') AND split = 'unassigned';

-- Mark 20% of verified images as val
WITH val_images AS (
    SELECT id FROM ml_dataset_images
    WHERE label_status = 'verified' AND is_active = TRUE
    ORDER BY random()
    LIMIT (
        SELECT GREATEST(1, CAST(COUNT(*) * 0.2 AS INTEGER))
        FROM ml_dataset_images
        WHERE label_status = 'verified' AND is_active = TRUE
    )
)
UPDATE ml_dataset_images
SET split = 'val'
WHERE id IN (SELECT id FROM val_images);

-- Verify split
SELECT
    split,
    COUNT(*) as image_count,
    SUM(CASE WHEN label_status = 'verified' THEN 1 ELSE 0 END) as verified_count
FROM ml_dataset_images
WHERE is_active = TRUE AND label_status != 'unlabeled'
GROUP BY split
ORDER BY split;