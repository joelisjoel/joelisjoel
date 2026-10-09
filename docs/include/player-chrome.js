// player-chrome: the shared UI furniture every player surface uses — the
// fullscreen glyphs, the flight hint, and the YouTube-style transport bar.
// Both the standalone vis chrome (DatatreeVis/TreeZeroVis with chrome on)
// and the homepage PlayerShell build from here, so the pieces can never
// drift apart between surfaces.

// YouTube-style fullscreen glyphs: corners out to enter, corners in to exit
export const FS_ENTER_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">'
    + '<path d="M3 3h6v2H5v4H3V3m12 0h6v6h-2V5h-4V3M3 15h2v4h4v2H3v-6m16 0h2v6h-6v-2h4v-4z"/></svg>';
export const FS_EXIT_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">'
    + '<path d="M9 3v6H3V7h4V3h2m6 0h2v4h4v2h-6V3M3 15h6v6H7v-4H3v-2m12 0h6v2h-4v4h-2v-6z"/></svg>';

export const HINT_FLY = 'click to fly';
export const HINT_FLYING = 'look: mouse or drag · WASD move · R/F up/down · click to exit';

// The lower-left flight hint
export function buildHint(container) {
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;left:14px;bottom:12px;font:12px Inter,sans-serif;'
        + 'color:rgba(190,225,255,0.8);text-shadow:0 0 8px rgba(90,180,255,0.9);'
        + 'pointer-events:none;user-select:none;z-index:2;';
    hint.textContent = HINT_FLY;
    container.appendChild(hint);
    return hint;
}

// The lower-right fullscreen button; `onToggle` receives the click
export function buildFullscreenButton(container, onToggle) {
    const fsButton = document.createElement('button');
    fsButton.innerHTML = FS_ENTER_ICON;
    fsButton.title = 'Fullscreen';
    fsButton.style.cssText = 'position:absolute;right:12px;bottom:8px;width:34px;height:34px;'
        + 'background:none;border:none;padding:5px;cursor:pointer;z-index:3;'
        + 'color:rgba(190,225,255,0.75);transition:color 0.15s;'
        + 'filter:drop-shadow(0 0 6px rgba(90,180,255,0.95));';
    fsButton.addEventListener('mouseenter', () => { fsButton.style.color = 'rgba(235,248,255,1)'; });
    fsButton.addEventListener('mouseleave', () => { fsButton.style.color = 'rgba(190,225,255,0.75)'; });
    fsButton.addEventListener('click', (event) => {
        event.stopPropagation();
        onToggle();
    });
    container.appendChild(fsButton);
    return fsButton;
}

// Transport bar: scrub track + play/pause + position readout, overlaid
// along the bottom edge like a video player. Returns handles the host
// drives: `update(frac, periodMs)` each frame, `setPlaying(on)` when the
// play state changes elsewhere.
export function buildTransportBar(container, { isPlaying, onPlayToggle, onSeek }) {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:4;'
        + 'padding:14px 12px 6px;user-select:none;'
        + 'background:linear-gradient(transparent, rgba(2,9,15,0.78));';
    const track = document.createElement('div');
    track.style.cssText = 'position:relative;height:5px;border-radius:3px;cursor:pointer;'
        + 'background:rgba(210,235,255,0.22);margin-bottom:7px;touch-action:none;';
    const fill = document.createElement('div');
    fill.style.cssText = 'position:absolute;left:0;top:0;bottom:0;border-radius:3px;'
        + 'background:linear-gradient(90deg,#52c8f0,#ffd98a);width:0%;';
    const dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;top:50%;width:13px;height:13px;border-radius:50%;'
        + 'background:#ffd98a;box-shadow:0 0 8px rgba(255,217,138,0.9);'
        + 'transform:translate(-50%,-50%);left:0%;pointer-events:none;';
    track.appendChild(fill);
    track.appendChild(dot);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding-right:44px;';
    const playBtn = document.createElement('button');
    playBtn.textContent = '❙❙';
    playBtn.title = 'Play / pause';
    playBtn.style.cssText = 'background:none;border:none;padding:0;cursor:pointer;'
        + 'width:26px;font-size:15px;color:rgba(220,240,255,0.92);'
        + 'text-shadow:0 0 8px rgba(90,180,255,0.9);line-height:22px;';
    playBtn.addEventListener('click', () => onPlayToggle());
    const timeText = document.createElement('span');
    timeText.style.cssText = 'font:12px Inter,sans-serif;color:rgba(200,228,250,0.85);'
        + 'text-shadow:0 0 6px rgba(60,140,220,0.8);letter-spacing:0.04em;';
    row.appendChild(playBtn);
    row.appendChild(timeText);
    bar.appendChild(track);
    bar.appendChild(row);
    container.appendChild(bar);

    let scrubbing = false;
    const seekFromEvent = (event) => {
        const rect = track.getBoundingClientRect();
        onSeek((event.clientX - rect.left) / Math.max(rect.width, 1));
    };
    track.addEventListener('pointerdown', (event) => {
        scrubbing = true;
        track.setPointerCapture(event.pointerId);
        seekFromEvent(event);
    });
    track.addEventListener('pointermove', (event) => { if (scrubbing) seekFromEvent(event); });
    track.addEventListener('pointerup', () => { scrubbing = false; });

    const format = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
    let shownStamp = '';
    const setPlaying = (on) => { playBtn.textContent = on ? '❙❙' : '▶'; };
    setPlaying(isPlaying ? isPlaying() : true);
    return {
        bar,
        playBtn,
        setPlaying,
        update(frac, periodMs) {
            const pct = `${(frac * 100).toFixed(2)}%`;
            fill.style.width = pct;
            dot.style.left = pct;
            const second = Math.floor(frac * (periodMs / 1000));
            const stamp = `${second}/${periodMs}`;
            if (stamp !== shownStamp) {
                shownStamp = stamp;
                timeText.textContent = `${format(second)} / ${format(periodMs / 1000)}`;
            }
        },
    };
}
