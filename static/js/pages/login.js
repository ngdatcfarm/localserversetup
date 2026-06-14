/**
 * Login Page — username/password form.
 *
 * Used at /#/login. If the user has `must_change_password = true`,
 * shows the change-password form right after a successful login
 * (no way to skip — until they change, all other pages stay locked).
 */
const { ref, computed, onMounted, watch } = Vue;

export default {
    setup() {
        const username = ref('');
        const password = ref('');
        const oldPassword = ref('');
        const newPassword = ref('');
        const confirmPassword = ref('');
        const submitting = ref(false);
        const errorMsg = ref('');

        // After login: if user.must_change_password, force change-password flow
        const currentUser = ref(null);
        const stage = ref('login');  // 'login' | 'change' | 'done'

        function clearError() { errorMsg.value = ''; }

        async function doLogin() {
            clearError();
            if (!username.value || !password.value) {
                errorMsg.value = 'Vui lòng nhập tên đăng nhập và mật khẩu';
                return;
            }
            submitting.value = true;
            try {
                const user = await API.auth.login(username.value, password.value);
                currentUser.value = user;
                if (user.must_change_password) {
                    stage.value = 'change';
                } else {
                    stage.value = 'done';
                    goHome();
                }
            } catch (e) {
                errorMsg.value = e.message || 'Đăng nhập thất bại';
            } finally {
                submitting.value = false;
            }
        }

        async function doChangePassword() {
            clearError();
            if (!oldPassword.value) {
                errorMsg.value = 'Vui lòng nhập mật khẩu hiện tại';
                return;
            }
            if (newPassword.value.length < 6) {
                errorMsg.value = 'Mật khẩu mới phải có ít nhất 6 ký tự';
                return;
            }
            if (newPassword.value !== confirmPassword.value) {
                errorMsg.value = 'Mật khẩu xác nhận không khớp';
                return;
            }
            submitting.value = true;
            try {
                await API.auth.changePassword(oldPassword.value, newPassword.value);
                stage.value = 'done';
                goHome();
            } catch (e) {
                errorMsg.value = e.message || 'Đổi mật khẩu thất bại';
            } finally {
                submitting.value = false;
            }
        }

        function goHome() {
            // Defer to let the cookie settle, then route to dashboard
            setTimeout(() => {
                window.location.hash = '#/';
                // Full reload to refresh the auth state in app.js
                window.location.reload();
            }, 50);
        }

        return {
            username, password, oldPassword, newPassword, confirmPassword,
            submitting, errorMsg, stage, currentUser,
            doLogin, doChangePassword,
        };
    },

    template: `
    <div class="cf-login-page">
        <div class="cf-login-card">
            <div class="cf-login-header">
                <div class="cf-login-icon">🚜</div>
                <h1 class="cf-login-title">CFarm</h1>
                <p class="cf-login-subtitle">Quản lý trang trại thông minh</p>
            </div>

            <!-- ── LOGIN FORM ── -->
            <form v-if="stage === 'login'" @submit.prevent="doLogin" class="cf-login-form">
                <h2 class="cf-login-form-title">Đăng nhập</h2>
                <div class="cf-form-group">
                    <label class="cf-label">Tên đăng nhập</label>
                    <input v-model="username" type="text" class="cf-input" autocomplete="username" autofocus required>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Mật khẩu</label>
                    <input v-model="password" type="password" class="cf-input" autocomplete="current-password" required>
                </div>
                <div v-if="errorMsg" class="cf-login-error">⚠️ {{ errorMsg }}</div>
                <button type="submit" class="cf-btn-primary cf-login-submit" :disabled="submitting">
                    {{ submitting ? 'Đang đăng nhập...' : 'Đăng nhập' }}
                </button>
            </form>

            <!-- ── CHANGE PASSWORD FORM (forced first-login) ── -->
            <form v-else-if="stage === 'change'" @submit.prevent="doChangePassword" class="cf-login-form">
                <h2 class="cf-login-form-title">Đổi mật khẩu</h2>
                <p class="cf-login-warn">
                    🔒 Đây là lần đăng nhập đầu tiên. Vui lòng đổi mật khẩu mặc định trước khi tiếp tục.
                </p>
                <div class="cf-form-group">
                    <label class="cf-label">Tài khoản</label>
                    <input :value="currentUser?.username" type="text" class="cf-input" disabled>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Mật khẩu hiện tại</label>
                    <input v-model="oldPassword" type="password" class="cf-input" autocomplete="current-password" required>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Mật khẩu mới (ít nhất 6 ký tự)</label>
                    <input v-model="newPassword" type="password" class="cf-input" autocomplete="new-password" required>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Xác nhận mật khẩu mới</label>
                    <input v-model="confirmPassword" type="password" class="cf-input" autocomplete="new-password" required>
                </div>
                <div v-if="errorMsg" class="cf-login-error">⚠️ {{ errorMsg }}</div>
                <button type="submit" class="cf-btn-primary cf-login-submit" :disabled="submitting">
                    {{ submitting ? 'Đang lưu...' : 'Đổi mật khẩu & vào hệ thống' }}
                </button>
            </form>
        </div>
    </div>
    `
};
