/* ==========================================================================
   KONSEP PBO / OOP PADA BACKEND (JAVASCRIPT CLASSES & INHERITANCE)
   ========================================================================== */

class User {
    constructor(id, username, password, fullName, email, role) {
        this.id = id;
        this.username = username;
        this.password = password;
        this.fullName = fullName;
        this.email = email;
        this.role = role;
    }

    getDetails() {
        return `${this.fullName} (${this.role})`;
    }
}

class AdminUser extends User {
    constructor(id, username, password, fullName, email) {
        super(id, username, password, fullName, email, 'admin');
    }
    canManageUsers() { return true; }
}

class RegularUser extends User {
    constructor(id, username, password, fullName, email) {
        super(id, username, password, fullName, email, 'user');
    }
    canManageUsers() { return false; }
}

/* ==========================================================================
   CLOUDFLARE WORKER ROUTING & HANDLERS
   ========================================================================== */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS Headers agar frontend bisa akses
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Setup / Inisialisasi Tabel & Data Demo Otomatis
            if (path === "/api/init" && method === "GET") {
                await env.pbo.exec(`
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        password TEXT NOT NULL,
                        full_name TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        role TEXT NOT NULL CHECK(role IN ('admin', 'user'))
                    );
                `);
                
                // Cek apakah sudah ada data
                const { results } = await env.pbo.prepare("SELECT COUNT(*) as count FROM users").all();
                if (results[0].count === 0) {
                    await env.pbo.prepare(
                        "INSERT INTO users (username, password, full_name, email, role) VALUES (?, ?, ?, ?, ?)"
                    ).bind('admin', '123456', 'Administrator Utama', 'admin@mail.com', 'admin').run();

                    await env.pbo.prepare(
                        "INSERT INTO users (username, password, full_name, email, role) VALUES (?, ?, ?, ?, ?)"
                    ).bind('user', '123456', 'Budi Santoso', 'budi@mail.com', 'user').run();
                }

                return new Response(JSON.stringify({ success: true, message: "Database D1 & Data Demo Siap!" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // API: LOGIN
            if (path === "/api/login" && method === "POST") {
                const { username, password } = await request.json();
                const { results } = await env.pbo.prepare(
                    "SELECT * FROM users WHERE username = ? AND password = ?"
                ).bind(username, password).all();

                if (results.length > 0) {
                    const row = results[0];
                    let userObj = row.role === 'admin' 
                        ? new AdminUser(row.id, row.username, row.password, row.full_name, row.email)
                        : new RegularUser(row.id, row.username, row.password, row.full_name, row.email);

                    return new Response(JSON.stringify({ success: true, user: userObj }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }
                return new Response(JSON.stringify({ success: false, message: "Username atau Password salah!" }), {
                    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // API: GET ALL USERS (Admin)
            if (path === "/api/users" && method === "GET") {
                const { results } = await env.pbo.prepare("SELECT id, username, full_name as fullName, email, role FROM users").all();
                return new Response(JSON.stringify(results), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // API: CREATE USER (Admin)
            if (path === "/api/users" && method === "POST") {
                const data = await request.json();
                await env.pbo.prepare(
                    "INSERT INTO users (username, password, full_name, email, role) VALUES (?, ?, ?, ?, ?)"
                ).bind(data.username, data.password || '123456', data.fullName, data.email, data.role).run();

                return new Response(JSON.stringify({ success: true, message: "User berhasil ditambahkan" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // API: UPDATE USER (Admin / Profil Sendiri)
            if (path.startsWith("/api/users/") && method === "PUT") {
                const id = path.split("/")[3];
                const data = await request.json();

                if (data.password) {
                    await env.pbo.prepare(
                        "UPDATE users SET username = ?, password = ?, full_name = ?, email = ?, role = ? WHERE id = ?"
                    ).bind(data.username, data.password, data.fullName, data.email, data.role, id).run();
                } else {
                    await env.pbo.prepare(
                        "UPDATE users SET username = ?, full_name = ?, email = ?, role = ? WHERE id = ?"
                    ).bind(data.username, data.fullName, data.email, data.role, id).run();
                }

                return new Response(JSON.stringify({ success: true, message: "User berhasil diperbarui" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // API: DELETE USER (Admin)
            if (path.startsWith("/api/users/") && method === "DELETE") {
                const id = path.split("/")[3];
                await env.pbo.prepare("DELETE FROM users WHERE id = ?").bind(id).run();

                return new Response(JSON.stringify({ success: true, message: "User berhasil dihapus" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // SERVE FRONTEND (1 File HTML Lengkap dengan 3 Form)
            if (path === "/" || path === "/index.html") {
                return new Response(getHtmlTemplate(), {
                    headers: { "Content-Type": "text/html;charset=UTF-8" }
                });
            }

            return new Response("Not Found", { status: 404, headers: corsHeaders });

        } catch (err) {
            return new Response(JSON.stringify({ success: false, error: err.message }), {
                status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }
    }
};

/* ==========================================================================
   FRONTEND HTML TEMPLATE (3 Form: Login, Profil, Tabel Users)
   ========================================================================== */
function getHtmlTemplate() {
    return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aplikasi CRUD PBO - Cloudflare D1</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }
        body { background-color: #f4f7f6; padding: 20px; color: #333; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 25px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        nav { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 20px; }
        nav button { background: #e74c3c; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; }
        .form-card { max-width: 400px; margin: 40px auto; border: 1px solid #ddd; padding: 20px; border-radius: 6px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input, .form-group select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
        button.btn-primary { width: 100%; background: #3498db; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button.btn-primary:hover { background: #2980b9; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        table, th, td { border: 1px solid #ddd; }
        th, td { padding: 10px; text-align: left; }
        th { background-color: #3498db; color: white; }
        .btn-action { padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer; color: white; margin-right: 5px; }
        .btn-edit { background: #f39c12; }
        .btn-delete { background: #e74c3c; }
        .hidden { display: none; }
        .badge { padding: 3px 8px; border-radius: 12px; font-size: 12px; color: white; }
        .badge-admin { background: #8e44ad; }
        .badge-user { background: #2ecc71; }
    </style>
</head>
<body>

<div class="container">
    <nav id="navbar" class="hidden">
        <h2>Sistem Manajemen User (D1 SQLite)</h2>
        <div>
            <span id="welcome-msg" style="margin-right: 15px; font-weight: bold;"></span>
            <button onclick="app.logout()">Logout</button>
        </div>
    </nav>

    <!-- FORM 1: LOGIN -->
    <div id="section-login" class="form-card">
        <h2 style="text-align: center; margin-bottom: 20px;">Form Login</h2>
        <form id="login-form">
            <div class="form-group">
                <label>Username</label>
                <input type="text" id="login-username" required placeholder="admin / user">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="login-password" required placeholder="123456">
            </div>
            <button type="submit" class="btn-primary">Login</button>
        </form>
        <div style="margin-top: 15px; font-size: 13px; color: #666;">
            <p><strong>Demo Login:</strong></p>
            <p>- Admin: <code>admin</code> / <code>123456</code></p>
            <p>- User: <code>user</code> / <code>123456</code></p>
        </div>
    </div>

    <!-- FORM 2: PROFIL (User) -->
    <div id="section-profile" class="hidden">
        <h2>Profil Saya</h2>
        <div class="form-card" style="margin: 20px 0;">
            <form id="profile-form">
                <div class="form-group">
                    <label>Username (Readonly)</label>
                    <input type="text" id="prof-username" readonly>
                </div>
                <div class="form-group">
                    <label>Nama Lengkap</label>
                    <input type="text" id="prof-fullname" required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="prof-email" required>
                </div>
                <div class="form-group">
                    <label>Password Baru (Opsional)</label>
                    <input type="password" id="prof-password" placeholder="Kosongkan jika tidak diubah">
                </div>
                <button type="submit" class="btn-primary">Update Profil</button>
            </form>
        </div>
    </div>

    <!-- FORM 3: TABEL USERS & MANAJEMEN (Admin) -->
    <div id="section-admin" class="hidden">
        <h2>Kelola Data User (Admin Panel)</h2>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4 id="form-user-title">Tambah User Baru</h4>
            <form id="user-management-form" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                <input type="hidden" id="user-id">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="manage-username" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="manage-password" placeholder="Isi password">
                </div>
                <div class="form-group">
                    <label>Nama Lengkap</label>
                    <input type="text" id="manage-fullname" required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="manage-email" required>
                </div>
                <div class="form-group">
                    <label>Peran</label>
                    <select id="manage-role">
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                <div style="grid-column: span 2; display: flex; gap: 10px;">
                    <button type="submit" class="btn-primary">Simpan User</button>
                    <button type="button" onclick="app.resetAdminForm()" style="background: #7f8c8d; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%;">Batal</button>
                </div>
            </form>
        </div>

        <h3>Daftar Pengguna</h3>
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Nama Lengkap</th>
                    <th>Email</th>
                    <th>Peran</th>
                    <th>Aksi</th>
                </tr>
            </thead>
            <tbody id="user-table-body"></tbody>
        </table>
    </div>
</div>

<script>
class AppManager {
    constructor() {
        this.currentUser = null;
        this.initDatabase();
    }

    async initDatabase() {
        try {
            await fetch('/api/init');
        } catch (e) {
            console.error("Gagal menginisialisasi database:", e);
        }
    }

    async login(username, password) {
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                this.currentUser = data.user;
                this.renderUI();
            } else {
                alert(data.message);
            }
        } catch (e) {
            alert('Terjadi kesalahan koneksi.');
        }
    }

    logout() {
        this.currentUser = null;
        this.renderUI();
    }

    async saveUser(userData) {
        try {
            let url = '/api/users';
            let method = userData.id ? 'PUT' : 'POST';
            if (userData.id) url += '/' + userData.id;

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            const data = await res.json();
            if (data.success) {
                alert('Data berhasil disimpan!');
                if (this.currentUser && !this.currentUser.canManageUsers) {
                    this.currentUser.fullName = userData.fullName;
                    this.currentUser.email = userData.email;
                }
                this.renderUI();
            } else {
                alert('Gagal menyimpan data.');
            }
        } catch (e) {
            alert('Terjadi kesalahan.');
        }
    }

    async deleteUser(id) {
        if (confirm('Yakin ingin menghapus user ini?')) {
            try {
                await fetch('/api/users/' + id, { method: 'DELETE' });
                this.renderUI();
            } catch (e) {
                alert('Gagal menghapus.');
            }
        }
    }

    renderUI() {
        const secLogin = document.getElementById('section-login');
        const secProfile = document.getElementById('section-profile');
        const secAdmin = document.getElementById('section-admin');
        const navbar = document.getElementById('navbar');
        const welcomeMsg = document.getElementById('welcome-msg');

        secLogin.classList.add('hidden');
        secProfile.classList.add('hidden');
        secAdmin.classList.add('hidden');
        navbar.classList.add('hidden');

        if (!this.currentUser) {
            secLogin.classList.remove('hidden');
        } else {
            navbar.classList.remove('hidden');
            welcomeMsg.textContent = \`Halo, \${this.currentUser.fullName} (\${this.currentUser.role.toUpperCase()})\`;

            // Cek hak akses berdasarkan method OOP / Role
            if (this.currentUser.role === 'admin') {
                secAdmin.classList.remove('hidden');
                this.renderAdminTable();
            } else {
                secProfile.classList.remove('hidden');
                this.renderProfileForm();
            }
        }
    }

    renderProfileForm() {
        document.getElementById('prof-username').value = this.currentUser.username;
        document.getElementById('prof-fullname').value = this.currentUser.fullName;
        document.getElementById('prof-email').value = this.currentUser.email;
    }

    async renderAdminTable() {
        const tbody = document.getElementById('user-table-body');
        tbody.innerHTML = '';
        const res = await fetch('/api/users');
        const users = await res.json();

        users.forEach(u => {
            const tr = document.createElement('tr');
            const roleClass = u.role === 'admin' ? 'badge-admin' : 'badge-user';
            tr.innerHTML = \`
                <td>\${u.id}</td>
                <td>\${u.username}</td>
                <td>\${u.fullName}</td>
                <td>\${u.email}</td>
                <td><span class="badge \${roleClass}">\${u.role}</span></td>
                <td>
                    <button class="btn-action btn-edit" onclick="app.setupEditForm(\${u.id}, '\${u.username}', '\${u.fullName}', '\${u.email}', '\${u.role}')">Edit</button>
                    \${u.id !== this.currentUser.id ? \`<button class="btn-action btn-delete" onclick="app.deleteUser(\${u.id})">Hapus</button>\` : ''}
                </td>
            \`;
            tbody.appendChild(tr);
        });
    }

    setupEditForm(id, username, fullName, email, role) {
        document.getElementById('user-id').value = id;
        document.getElementById('manage-username').value = username;
        document.getElementById('manage-password').value = '';
        document.getElementById('manage-fullname').value = fullName;
        document.getElementById('manage-email').value = email;
        document.getElementById('manage-role').value = role;
        document.getElementById('form-user-title').textContent = \`Edit User ID: \${id}\`;
    }

    resetAdminForm() {
        document.getElementById('user-management-form').reset();
        document.getElementById('user-id').value = '';
        document.getElementById('form-user-title').textContent = 'Tambah User Baru';
    }
}

const app = new AppManager();

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    app.login(
        document.getElementById('login-username').value,
        document.getElementById('login-password').value
    );
});

document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    app.saveUser({
        id: app.currentUser.id,
        username: app.currentUser.username,
        password: document.getElementById('prof-password').value,
        fullName: document.getElementById('prof-fullname').value,
        email: document.getElementById('prof-email').value,
        role: app.currentUser.role
    });
});

document.getElementById('user-management-form').addEventListener('submit', (e) => {
    e.preventDefault();
    app.saveUser({
        id: document.getElementById('user-id').value,
        username: document.getElementById('manage-username').value,
        password: document.getElementById('manage-password').value,
        fullName: document.getElementById('manage-fullname').value,
        email: document.getElementById('manage-email').value,
        role: document.getElementById('manage-role').value
    });
    app.resetAdminForm();
});
</script>
</body>
</html>`;
}
