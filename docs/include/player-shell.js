// PlayerShell: the homepage MiniPlayer host. Owns everything that is not a
// scene — fullscreen (native plus the iOS pseudo-fullscreen fallback), the
// shared transport bar, the picker drawer, and the vis registry. Scenes are
// supplied by the page as lazy loaders and must implement the vis
// interface (see docs/datatree2/DESIGN.md):
//
//   playing        boolean, get/set — the vis's master clock runs when true
//   suspended      boolean, set — hidden behind another vis; idle cheaply
//   manualMode     boolean, read — whether manual flight is engaged
//   PERIOD_MS      number, read — ms of one transport cycle
//   fraction()     current transport position in [0, 1)
//   seekToFraction(frac)  jump the clock; must stay within the current
//                  cycle so absolute-time motion (wind phase) never lurches
//   setManual(on)  enter/exit manual flight
//   resize()       re-fit the renderer to the container
//
// Vis specs: { id, title, sub, thumb, load(wrapper) -> Promise<vis> }.
// The loader constructs the vis headless ({ chrome: false }) inside the
// wrapper the shell provides; the shell supplies all chrome.
import {
    FS_ENTER_ICON, FS_EXIT_ICON, HINT_FLY, HINT_FLYING,
    buildHint, buildFullscreenButton, buildTransportBar,
} from './player-chrome.js?v=1';

export class PlayerShell {
    constructor(container, vises, options = {}) {
        this.container = container;
        this.vises = vises;
        this.hosts = new Map(); // id -> { wrapper, vis|null, loading }
        this.activeId = null;

        container.style.position = 'relative';
        container.style.overflow = 'hidden';

        this._buildChrome();
        this._buildPicker();
        this.selectVis(options.defaultVis ?? vises[0].id);
        this._updateChrome();

        this._animate = this._animate.bind(this);
        requestAnimationFrame(this._animate);
    }

    activeVis() {
        return this.hosts.get(this.activeId)?.vis ?? null;
    }

    // --- Fullscreen with an iOS-friendly fallback: iPhone Safari has no
    // element fullscreen API, so there we pin the container over the page
    // and dispatch a synthetic fullscreenchange so every listener reacts
    // identically. ---
    isFullscreen() {
        return document.fullscreenElement === this.container
            || this.container.classList.contains('pseudo-fs');
    }

    _setPseudo(on) {
        const c = this.container;
        c.classList.toggle('pseudo-fs', on);
        c.style.position = on ? 'fixed' : 'relative';
        c.style.inset = on ? '0' : '';
        c.style.zIndex = on ? '999' : '';
        c.style.background = on ? '#02090f' : '';
        document.documentElement.style.overflow = on ? 'hidden' : '';
        this.activeVis()?.resize();
        document.dispatchEvent(new Event('fullscreenchange'));
    }

    enterFullscreen() {
        if (this.container.requestFullscreen) this.container.requestFullscreen();
        else this._setPseudo(true);
    }

    exitFullscreen() {
        if (document.fullscreenElement === this.container) document.exitFullscreen?.();
        else if (this.container.classList.contains('pseudo-fs')) this._setPseudo(false);
    }

    // --- Chrome: hint, fullscreen button, transport, mini caption. All of
    // it fullscreen-only except the hover caption. ---
    _buildChrome() {
        this.hint = buildHint(this.container);
        this.hint.style.bottom = '48px'; // clear of the transport strip

        this.fsButton = buildFullscreenButton(this.container, () => {
            if (this.isFullscreen()) this.exitFullscreen();
            else this.enterFullscreen();
        });
        this.fsButton.style.bottom = '4px';

        this.transport = buildTransportBar(this.container, {
            isPlaying: () => this.activeVis()?.playing ?? true,
            onPlayToggle: () => {
                const vis = this.activeVis();
                if (!vis) return;
                vis.playing = !vis.playing;
                this.transport.setPlaying(vis.playing);
            },
            onSeek: (frac) => this.activeVis()?.seekToFraction(frac),
        });

        // The mini player is bare; a hover caption is its only affordance
        this.miniCaption = document.createElement('div');
        this.miniCaption.textContent = '⛶ click to expand';
        this.miniCaption.style.cssText = 'position:absolute;right:12px;bottom:10px;z-index:4;'
            + 'font:12px Inter,sans-serif;color:rgba(200,230,255,0.85);'
            + 'text-shadow:0 0 8px rgba(90,180,255,0.9);pointer-events:none;'
            + 'opacity:0;transition:opacity 0.2s;';
        this.container.appendChild(this.miniCaption);
        this.container.addEventListener('mouseenter', () => {
            if (!this.isFullscreen()) this.miniCaption.style.opacity = '1';
        });
        this.container.addEventListener('mouseleave', () => { this.miniCaption.style.opacity = '0'; });

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.container.classList.contains('pseudo-fs')) {
                this.exitFullscreen();
            }
        });
        document.addEventListener('fullscreenchange', () => {
            this.fsButton.innerHTML = this.isFullscreen() ? FS_EXIT_ICON : FS_ENTER_ICON;
            this.drawerOpen = this.isFullscreen() && window.innerWidth >= 900;
            this._updateChrome();
            this.activeVis()?.resize();
        });
        window.addEventListener('resize', () => this._updateChrome());
    }

    // --- Picker: a slim rail of thumbnail cards in a right-hand drawer;
    // picking swaps the scene in place — no navigation. ---
    _buildPicker() {
        this.picker = document.createElement('aside');
        this.picker.style.cssText = 'position:absolute;top:0;right:0;bottom:0;width:10vw;min-width:96px;'
            + 'z-index:5;padding:10px 8px;box-sizing:border-box;overflow-y:auto;'
            + 'background:rgba(2,9,15,0.7);backdrop-filter:blur(3px);transition:transform 0.25s;';
        const title = document.createElement('div');
        title.textContent = 'VISUALIZATIONS';
        title.style.cssText = 'font:600 10px Inter,sans-serif;letter-spacing:0.08em;'
            + 'color:rgba(160,195,220,0.8);margin:0 2px 8px;';
        this.picker.appendChild(title);
        this.pickerEntries = [];
        for (const vis of this.vises) {
            const entry = document.createElement('a');
            entry.href = '#';
            entry.style.cssText = 'display:block;margin-bottom:10px;padding:4px;border-radius:6px;'
                + 'text-decoration:none;';
            const img = document.createElement('img');
            img.src = vis.thumb;
            img.alt = vis.title;
            img.style.cssText = 'display:block;width:100%;height:auto;border-radius:4px;';
            const titleEl = document.createElement('span');
            titleEl.textContent = vis.title;
            titleEl.style.cssText = 'display:block;margin-top:5px;font:600 12px Inter,sans-serif;color:#e8f4ff;';
            const subEl = document.createElement('span');
            subEl.textContent = vis.sub;
            subEl.style.cssText = 'display:block;margin-top:1px;font:11px Inter,sans-serif;color:#8ea8b8;';
            entry.appendChild(img);
            entry.appendChild(titleEl);
            entry.appendChild(subEl);
            entry.addEventListener('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
                this.selectVis(vis.id);
            });
            this.picker.appendChild(entry);
            this.pickerEntries.push({ id: vis.id, el: entry });
        }
        this.container.appendChild(this.picker);

        // Drawer toggle, upper right
        this.drawerOpen = false;
        this.drawerBtn = document.createElement('button');
        this.drawerBtn.title = 'Visualizations';
        this.drawerBtn.style.cssText = 'position:absolute;top:10px;right:10px;z-index:6;width:30px;height:44px;'
            + 'background:rgba(2,9,15,0.55);border:none;border-radius:6px;cursor:pointer;'
            + 'font-size:16px;color:rgba(200,230,255,0.85);text-shadow:0 0 8px rgba(90,180,255,0.9);'
            + 'transition:right 0.25s;';
        this.drawerBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.drawerOpen = !this.drawerOpen;
            this._updateChrome();
        });
        this.container.appendChild(this.drawerBtn);
    }

    // All chrome lives in fullscreen; the transport bar stops short of the
    // drawer so they never overlap
    _updateChrome() {
        const fs = this.isFullscreen();
        this.picker.style.display = fs ? '' : 'none';
        this.transport.bar.style.display = fs ? '' : 'none';
        this.hint.style.display = fs ? '' : 'none';
        this.fsButton.style.display = fs ? '' : 'none';
        this.drawerBtn.style.display = fs ? '' : 'none';
        this.picker.style.transform = this.drawerOpen ? 'translateX(0)' : 'translateX(100%)';
        const rail = fs && this.drawerOpen ? this.picker.offsetWidth : 0;
        this.transport.bar.style.right = `${rail}px`;
        this.fsButton.style.right = `${rail + 12}px`;
        this.drawerBtn.style.right = `${rail + 10}px`;
        this.drawerBtn.textContent = this.drawerOpen ? '❯' : '❮';
        if (fs) this.miniCaption.style.opacity = '0';
        if (!fs) {
            for (const host of this.hosts.values()) {
                if (host.vis?.manualMode) host.vis.setManual(false);
            }
        }
    }

    // Each vis lives in its own wrapper; clicks expand from mini, and in
    // fullscreen toggle manual flight
    _makeHost(id) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:none;width:100%;position:relative;z-index:1;';
        this.container.appendChild(wrapper);
        const host = { wrapper, vis: null, loading: null };
        wrapper.addEventListener('click', () => {
            if (!this.isFullscreen()) {
                this.enterFullscreen();
                return;
            }
            if (host.vis) {
                host.vis.setManual(!host.vis.manualMode);
                this.hint.textContent = host.vis.manualMode ? HINT_FLYING : HINT_FLY;
            }
        });
        this.hosts.set(id, host);
        return host;
    }

    _applyVisibility() {
        for (const [id, host] of this.hosts) {
            const on = id === this.activeId;
            host.wrapper.style.display = on ? 'block' : 'none';
            if (host.vis) {
                host.vis.suspended = !on;
                if (on) host.vis.resize();
            }
        }
        for (const { id, el } of this.pickerEntries) {
            el.style.background = id === this.activeId ? 'rgba(38,74,99,0.45)' : 'transparent';
            el.style.outline = id === this.activeId ? '1px solid rgba(82,200,240,0.45)' : 'none';
        }
        this.transport.setPlaying(this.activeVis()?.playing ?? true);
    }

    selectVis(id) {
        this.activeId = id;
        const spec = this.vises.find((v) => v.id === id);
        if (spec && !this.hosts.has(id)) {
            const host = this._makeHost(id);
            host.loading = spec.load(host.wrapper).then((vis) => {
                host.vis = vis;
                this._applyVisibility();
            }).catch((err) => {
                console.error(`${spec.title} failed to load`, err);
                this.hosts.delete(id);
                host.wrapper.remove();
                const fallback = this.vises.find((v) => v.id !== id && this.hosts.has(v.id))
                    ?? this.vises.find((v) => v.id !== id);
                if (this.activeId === id && fallback) this.selectVis(fallback.id);
            });
        }
        this._applyVisibility();
    }

    // The shell's own loop only feeds the transport readout; scenes drive
    // their own rendering
    _animate() {
        requestAnimationFrame(this._animate);
        const vis = this.activeVis();
        if (vis) this.transport.update(vis.fraction(), vis.PERIOD_MS);
    }
}
