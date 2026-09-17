/* =============================================================
   Lapeeet — Git / Version Control Layer (Browser, isomorphic-git@1.25.0)
   Wraps isomorphic-git UMD + LightningFS + vendored http/web transport.
   Everything runs inside IndexedDB (via LightningFS) — no backend required.
   ============================================================= */

(function (global) {
    'use strict';

    const GIT_VERSION = '1.25.0';
    const DEFAULT_CORS_PROXY = 'https://cors.isomorphic-git.org';
    const DEFAULT_REFS_DIR = 'lapeeet-repos';

    function _resolveGitLib() {
        return (global.git || global.isogit || global.isomorphicGit || null);
    }

    function _resolveFs() {
        // LightningFS UMD exposes window.LightningFS by default.
        const LFS = global.LightningFS || global.lightningFs || null;
        if (!LFS) return null;
        // Namespace the IndexedDB filesystem so Lapeeet data doesn't
        // collide with other LightningFS-backed apps on the same origin.
        const fs = new LFS('lapeeet-fs-v1', { wipe: false });
        return { fs, pfs: fs.promises };
    }

    function _nowStamp() {
        const d = new Date();
        return { timestamp: Math.floor(d.getTime() / 1000), offset: -d.getTimezoneOffset() };
    }

    const LapeeetGit = {
        version: GIT_VERSION,
        available: false,
        initialized: false,
        fs: null,
        pfs: null,
        corsProxy: DEFAULT_CORS_PROXY,
        _currentRepoDir: '/' + DEFAULT_REFS_DIR + '/lapeeet-local',

        async init(opts = {}) {
            const git = _resolveGitLib();
            if (!git) {
                console.warn('[GIT] isomorphic-git UMD not loaded — window.git is missing.');
                this.available = false;
                return false;
            }
            const filesys = _resolveFs();
            if (!filesys) {
                console.warn('[GIT] LightningFS UMD not loaded — window.LightningFS missing.');
                this.available = false;
                return false;
            }
            this.fs = filesys.fs;
            this.pfs = filesys.pfs;
            this.git = git;
            this.gitHttp = global.gitHttp || null;
            if (opts.corsProxy) this.corsProxy = opts.corsProxy;
            if (opts.repoDir) this._currentRepoDir = opts.repoDir;
            this.author = opts.author || { name: 'Lapeeet User', email: 'user@lapeeet.local' };
            this.available = true;
            this.initialized = true;

            // Ensure default repo dir exists and is a valid git repo (init if not)
            try {
                await this._ensureRepo(this._currentRepoDir);
                console.info(`[GIT] initialized (v${GIT_VERSION} · LightningFS: lapeeet-fs-v1 · repo: ${this._currentRepoDir})`);
                return true;
            } catch (e) {
                console.warn('[GIT] init ok but repo bootstrap failed:', (e && e.message) || e);
                return true;
            }
        },

        async _ensureRepo(dir) {
            const git = this.git;
            const fs = this.fs;
            let existsHead = false;
            try {
                await fs.promises.stat(dir + '/.git/HEAD');
                existsHead = true;
            } catch (_) { existsHead = false; }
            if (!existsHead) {
                try { await fs.promises.mkdir(dir, { recursive: true }); } catch (_) {}
                await git.init({ fs, dir, defaultBranch: 'main' });
                // First commit (empty root tree) so every later add/commit works.
                await git.commit({
                    fs, dir,
                    message: 'root: lapeeet-browser repo initialized',
                    author: { ...this.author, ..._nowStamp() }
                });
            }
            return dir;
        },

        /* ---- repository management ---- */

        async createRepo(name = 'lapeeet-local') {
            const dir = '/' + DEFAULT_REFS_DIR + '/' + String(name).replace(/[^a-z0-9-_]+/gi, '-');
            await this._ensureRepo(dir);
            this._currentRepoDir = dir;
            return dir;
        },

        currentRepo() { return this._currentRepoDir; },

        async listRepos() {
            const base = '/' + DEFAULT_REFS_DIR;
            try {
                const entries = await this.pfs.readdir(base);
                const ok = [];
                for (const n of entries) {
                    try {
                        await this.pfs.stat(base + '/' + n + '/.git/HEAD');
                        ok.push(n);
                    } catch (_) { /* not a git repo */ }
                }
                return ok;
            } catch (_) { return []; }
        },

        async status(filepath, opts = {}) {
            const dir = opts.dir || this._currentRepoDir;
            return this.git.status({ fs: this.fs, dir, filepath });
        },

        async writeFile(relPath, content, encoding = 'utf8', opts = {}) {
            const dir = opts.dir || this._currentRepoDir;
            const full = dir + '/' + relPath;
            const parent = full.split('/').slice(0, -1).join('/');
            if (parent) {
                try { await this.pfs.mkdir(parent, { recursive: true }); } catch (_) {}
            }
            await this.pfs.writeFile(full, content, encoding);
            return full;
        },

        async readFile(relPath, encoding = 'utf8', opts = {}) {
            const dir = opts.dir || this._currentRepoDir;
            const buf = await this.pfs.readFile(dir + '/' + relPath, encoding);
            return buf;
        },

        async commit(message, opts = {}) {
            const dir = opts.dir || this._currentRepoDir;
            const dirs = [dir];
            // Stage: walk working tree, add any file that is tracked or new.
            const changed = [];
            const matrix = await this.git.statusMatrix({ fs: this.fs, dir });
            for (const [filepath, head, workdir, stage] of matrix) {
                if (filepath === undefined) continue;
                // state: workdir != stage or untracked workdir (0 vs 2)
                const needsAdd = workdir !== 0 && stage !== workdir;
                if (needsAdd) {
                    try {
                        await this.git.add({ fs: this.fs, dir, filepath });
                        changed.push(filepath);
                    } catch (e) {
                        // Deleted local — mirror with `remove`
                        try { await this.git.remove({ fs: this.fs, dir, filepath }); changed.push(filepath); }
                        catch (_) {}
                    }
                }
            }
            if (!changed.length && !opts.allowEmpty) {
                return { sha: null, skipped: true, reason: 'nothing to commit' };
            }
            const sha = await this.git.commit({
                fs: this.fs, dir,
                message: String(message || ('auto: ' + new Date().toISOString())),
                author: { ...(opts.author || this.author), ..._nowStamp() }
            });
            return { sha, changed };
        },

        async log(depth = 20, opts = {}) {
            const dir = opts.dir || this._currentRepoDir;
            try {
                return await this.git.log({ fs: this.fs, dir, depth });
            } catch (e) {
                console.warn('[GIT] log failed:', (e && e.message) || e);
                return [];
            }
        },

        async clone(url, opts = {}) {
            const name = opts.name || url.split('/').pop().replace(/\.git$/, '') || ('clone-' + Date.now());
            const dir = '/' + DEFAULT_REFS_DIR + '/' + String(name).replace(/[^a-z0-9-_]+/gi, '-');
            try { await this.pfs.mkdir(dir, { recursive: true }); } catch (_) {}
            if (!this.gitHttp) throw new Error('gitHttp transport not loaded (http/web/index.js)');
            await this.git.clone({
                fs: this.fs,
                http: this.gitHttp,
                dir,
                url,
                corsProxy: (opts.corsProxy === null) ? undefined : (opts.corsProxy || this.corsProxy),
                ref: opts.ref || undefined,
                singleBranch: opts.singleBranch !== false,
                depth: opts.depth || 10
            });
            this._currentRepoDir = dir;
            return { dir, name };
        },

        async push(opts = {}) {
            const dir = opts.dir || this._currentRepoDir;
            if (!this.gitHttp) throw new Error('gitHttp transport not loaded');
            return this.git.push({
                fs: this.fs,
                http: this.gitHttp,
                dir,
                remote: opts.remote || 'origin',
                ref: opts.ref || undefined,
                corsProxy: (opts.corsProxy === null) ? undefined : (opts.corsProxy || this.corsProxy),
                username: opts.username || undefined,
                password: opts.password || undefined,
                token: opts.token || undefined
            });
        },

        async fetch(opts = {}) {
            const dir = opts.dir || this._currentRepoDir;
            if (!this.gitHttp) throw new Error('gitHttp transport not loaded');
            return this.git.fetch({
                fs: this.fs,
                http: this.gitHttp,
                dir,
                remote: opts.remote || 'origin',
                corsProxy: (opts.corsProxy === null) ? undefined : (opts.corsProxy || this.corsProxy),
                singleBranch: opts.singleBranch !== false,
                tags: opts.tags || false
            });
        },

        async inspectWorkingTree(opts = {}) {
            const dir = opts.dir || this._currentRepoDir;
            try {
                const rows = await this.git.statusMatrix({ fs: this.fs, dir });
                return rows.map(([filepath, head, workdir, stage]) => ({ filepath, head, workdir, stage }));
            } catch (e) { return []; }
        },

        async storageInfo() {
            if (!this.fs) return { fsReady: false };
            const info = { fsReady: true, repo: this._currentRepoDir };
            try {
                const rootFiles = await this.pfs.readdir(this._currentRepoDir);
                info.files = rootFiles.length;
            } catch (_) { info.files = 0; }
            if (navigator && navigator.storage && navigator.storage.estimate) {
                try {
                    const est = await navigator.storage.estimate();
                    info.quotaBytes = est.quota || null;
                    info.usedBytes = est.usage || null;
                } catch (_) {}
            }
            return info;
        }
    };

    // Auto-wait for git-ready event, then call init silently so that any code
    // that accesses window.LapeeetGit later can assume boot is underway.
    global.addEventListener('lapeeet:git-ready', async () => {
        try {
            await LapeeetGit.init({});
        } catch (e) { console.warn('[GIT] auto-init failed:', e); }
    }, { once: true });

    global.LapeeetGit = LapeeetGit;
})(window);
