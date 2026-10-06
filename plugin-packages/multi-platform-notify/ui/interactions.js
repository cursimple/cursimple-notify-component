const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let segmentObserver;

/** Preserve the segmented indicator when data refreshes replace the page content. */
export function bindSegments(root, previous) {
  const bar = root.querySelector('.segs');
  const thumb = bar?.querySelector('.seg-thumb');
  if (!thumb) return;
  const selected = bar.querySelector('[aria-selected="true"]');
  const place = () => {
    const active = bar.querySelector('[aria-selected="true"]');
    if (!active || !bar.isConnected) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  };
  thumb.style.transition = 'none';
  thumb.style.width = previous?.width || `${selected.offsetWidth}px`;
  thumb.style.transform = previous?.transform || `translateX(${selected.offsetLeft}px)`;
  void thumb.offsetWidth;
  thumb.style.transition = '';
  segmentObserver?.disconnect();
  if (typeof ResizeObserver !== 'undefined') {
    segmentObserver = new ResizeObserver(place);
    segmentObserver.observe(bar);
  }
  requestAnimationFrame(place);
}

export function segmentPosition(root) {
  const thumb = root.querySelector('.seg-thumb');
  if (!thumb) return null;
  const style = getComputedStyle(thumb);
  return {width:style.width, transform:style.transform};
}

/** Keep a modal mounted across edits, with bounded closing and pointer cancellation. */
export function createSheets({app, icon, cancel}) {
  let active = null;
  let returnFocus = null;
  const restoreFocus = () => {
    app.inert = false;
    document.body.classList.remove('sheet-open');
    const selector = returnFocus?.id ? `#${CSS.escape(returnFocus.id)}` : returnFocus?.dataset.edit ? `[data-edit="${CSS.escape(returnFocus.dataset.edit)}"]` : null;
    const target = returnFocus?.isConnected ? returnFocus : selector ? app.querySelector(selector) : null;
    target?.focus({preventScroll:true});
    returnFocus = null;
  };
  const close = () => {
    if (!active || active.classList.contains('closing')) return;
    cancel();
    const overlay = active;
    active = null;
    overlay.classList.add('closing');
    const done = () => {
      overlay.remove();
      if (!active) restoreFocus();
    };
    if (reduceMotion()) done(); else setTimeout(done,180);
  };
  const open = (title, body, bind) => {
    cancel();
    const reuse = !!active;
    const scroll = reuse && active.dataset.title === title ? active.querySelector('.sheet-body').scrollTop : 0;
    const overlay = active || document.createElement('div');
    if (!reuse) {
      document.querySelectorAll('.sheet-backdrop.closing').forEach(node => node.remove());
      returnFocus = document.activeElement;
      overlay.id = 'sheet';
      overlay.className = 'sheet-backdrop';
      overlay.innerHTML = `<section class="sheet enter" role="dialog" aria-modal="true"><div class="sheet-grip"><div class="sheet-handle"></div><header><h2></h2><button class="icon" id="close-sheet" aria-label="关闭">${icon('close')}</button></header></div><div class="sheet-body"></div><div class="sheet-footer" hidden></div></section>`;
      document.body.append(overlay);
    }
    active = overlay;
    overlay.dataset.title = title;
    const panel = overlay.querySelector('.sheet');
    panel.setAttribute('aria-label',title);
    panel.querySelector('h2').textContent = title;
    if (reuse) panel.classList.remove('enter');
    const content = overlay.querySelector('.sheet-body');
    content.innerHTML = body;
    const footer = overlay.querySelector('.sheet-footer');
    const actions = content.querySelector('.save-row');
    footer.replaceChildren(...(actions ? [actions] : []));
    footer.hidden = !actions;
    content.scrollTop = scroll;
    app.inert = true;
    document.body.classList.add('sheet-open');
    overlay.querySelector('#close-sheet').onclick = close;
    overlay.onclick = event => { if (event.target === overlay) close(); };
    if (!reuse) {
      panel.addEventListener('animationend',event => { if (event.animationName === 'sheetIn') panel.classList.remove('enter'); });
      const grip = overlay.querySelector('.sheet-grip');
      let gesture = null;
      grip.addEventListener('pointerdown',event => {
        if (event.target.closest('button') || event.button !== 0) return;
        gesture = {id:event.pointerId,start:event.clientY,last:event.clientY,time:event.timeStamp,velocity:0};
        panel.style.transition = 'none';
        try { grip.setPointerCapture(event.pointerId); } catch {}
      });
      grip.addEventListener('pointermove',event => {
        if (!gesture || event.pointerId !== gesture.id) return;
        gesture.velocity = (event.clientY-gesture.last)/Math.max(1,event.timeStamp-gesture.time);
        gesture.last = event.clientY;
        gesture.time = event.timeStamp;
        panel.style.transform = `translateY(${Math.max(0,event.clientY-gesture.start)}px)`;
      });
      const end = event => {
        if (!gesture || event.pointerId !== gesture.id) return;
        const dismiss = event.type !== 'pointercancel' && (event.clientY-gesture.start > panel.offsetHeight/4 || (event.clientY-gesture.start > 24 && gesture.velocity > .6));
        const gestureStart = gesture.start;
        gesture = null;
        panel.style.transition = '';
        if (dismiss) {
          panel.style.setProperty('--dismiss-offset',`${Math.max(0,event.clientY-gestureStart)}px`);
          close();
        } else panel.style.transform = '';
      };
      grip.addEventListener('pointerup',end);
      grip.addEventListener('pointercancel',end);
      overlay.querySelector('#close-sheet').focus({preventScroll:true});
    }
    bind?.(overlay);
  };
  document.addEventListener('keydown',event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const nodes = [...active.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type=hidden]),summary,a[href]')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  return {open,close};
}
