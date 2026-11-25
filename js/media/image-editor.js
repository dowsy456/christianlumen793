/* Local attachment editing. Originals are replaced only after an explicit Save. */
(function (App) {
  "use strict";
  const paths = {
    select:'M5 3v17l4-5 4 7 3-2-4-7 7-1L5 3Z',
    pan:'M9 13V5a2 2 0 0 1 4 0v7M13 10V4a2 2 0 0 1 4 0v8M17 10a2 2 0 0 1 4 0v7a5 5 0 0 1-5 5h-3a5 5 0 0 1-4-2L4 14a2 2 0 0 1 3-2l2 1',
    crop:'M7 3v14h14M3 7h14v14', arrow:'M4 20 20 4M9 4h11v11',
    pen:'m4 16 12-12 4 4L8 20H4v-4Z', text:'M4 5h16M12 5v15M8 20h8', redact:'M4 5h16v14H4Z',
    undo:'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12', redo:'m15 5 5 5-5 5M20 10H10a6 6 0 0 0 0 12',
    save:'m4 12 5 5L20 6', zoom:'M4 10V4h6M14 4h6v6M20 14v6h-6M10 20H4v-6'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${paths[name]}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${name === "redact" ? ' fill="currentColor"' : ''}/></svg>`;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const number = (value, min, max, fallback) => clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, min, max);
  const editStyle = style => ({
    color:/^#[0-9a-f]{6}$/i.test(style?.color || "") ? style.color : "#ef3737",
    strokeColor:/^#[0-9a-f]{6}$/i.test(style?.strokeColor || "") ? style.strokeColor : "#000000",
    size:number(style?.size,8,200,32), width:number(style?.width,1,30,3), strokeWidth:number(style?.strokeWidth,0,10,1),
    unitScale:number(style?.unitScale,.001,1000,1)
  });
  const textPixels = style => style.size * style.unitScale;
  const textFont = style => `${textPixels(style)}px Arial, sans-serif`;
  const textOutline = style => style.strokeWidth * 2 * style.unitScale;
  const segmentDistance = (p,a,b) => {
    const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  };
  App.pendingImageEditDocuments ||= new WeakMap();
  App.imageEditObjectBounds = function (operation, ctx) {
    const style=editStyle(operation.style), pad=(style.width/2+style.strokeWidth)*style.unitScale;
    if (operation.tool === "text") {
      ctx.save();ctx.font=textFont(style);
      const lines=String(operation.text||"").split("\n"), width=Math.max(1,...lines.map(line=>ctx.measureText(line).width));ctx.restore();
      return {x:operation.a.x,y:operation.a.y,w:width,h:lines.length*textPixels(style)*1.25};
    }
    const points=operation.tool === "pen" ? operation.points : [operation.a,operation.b];
    const extra=operation.tool === "arrow" ? Math.max(12*style.unitScale,style.width*style.unitScale*5) : pad;
    const x=Math.min(...points.map(p=>p.x))-extra,y=Math.min(...points.map(p=>p.y))-extra;
    return {x,y,w:Math.max(...points.map(p=>p.x))+extra-x,h:Math.max(...points.map(p=>p.y))+extra-y};
  };
  function hitObject(op,p,ctx,tolerance) {
    const style=editStyle(op.style), width=(style.width/2+style.strokeWidth)*style.unitScale+tolerance;
    if(op.tool === "text") {const b=App.imageEditObjectBounds(op,ctx);return p.x>=b.x-tolerance&&p.x<=b.x+b.w+tolerance&&p.y>=b.y-tolerance&&p.y<=b.y+b.h+tolerance;}
    if(op.tool === "pen") return op.points.length===1 ? Math.hypot(p.x-op.a.x,p.y-op.a.y)<=width : op.points.some((v,i)=>i&&segmentDistance(p,op.points[i-1],v)<=width);
    if(op.tool !== "arrow") return false;
    if(segmentDistance(p,op.a,op.b)<=width) return true;
    const angle=Math.atan2(op.b.y-op.a.y,op.b.x-op.a.x),tip=Math.max(12*style.unitScale,style.width*style.unitScale*5);
    const path=new Path2D();path.moveTo(op.b.x,op.b.y);path.lineTo(op.b.x-tip*Math.cos(angle-.5),op.b.y-tip*Math.sin(angle-.5));path.lineTo(op.b.x-tip*Math.cos(angle+.5),op.b.y-tip*Math.sin(angle+.5));path.closePath();
    ctx.save();ctx.setTransform(1,0,0,1,0,0);const inside=ctx.isPointInPath(path,p.x,p.y);ctx.restore();return inside;
  }
  App.imageEditRectangle = function (a, b, width, height) {
    const x = clamp(Math.floor(Math.min(a.x, b.x)), 0, width - 1);
    const y = clamp(Math.floor(Math.min(a.y, b.y)), 0, height - 1);
    return { x, y, w:Math.max(1, clamp(Math.ceil(Math.max(a.x, b.x)), x + 1, width) - x), h:Math.max(1, clamp(Math.ceil(Math.max(a.y, b.y)), y + 1, height) - y) };
  };
  App.paintImageEdit = function (ctx, operation, width, height) {
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    const style = editStyle(operation.style);
    ctx.lineWidth = style.width * style.unitScale;
    ctx.strokeStyle = style.color; ctx.fillStyle = style.color;
    const a = operation.a, b = operation.b;
    if (operation.tool === "redact") {
      const r = App.imageEditRectangle(a, b, width, height);
      // Deliberately solid, source-over pixels: no blur or reversible overlay survives Save.
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000000";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    } else if (operation.tool === "arrow") {
      const angle = Math.atan2(b.y - a.y, b.x - a.x), tip = Math.max(12 * style.unitScale, ctx.lineWidth * 5);
      const shaftWidth = ctx.lineWidth;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = style.strokeColor; ctx.lineWidth = shaftWidth + textOutline(style); if(style.strokeWidth) ctx.stroke();
      ctx.strokeStyle = style.color; ctx.lineWidth = shaftWidth; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - tip * Math.cos(angle - .5), b.y - tip * Math.sin(angle - .5));
      ctx.lineTo(b.x - tip * Math.cos(angle + .5), b.y - tip * Math.sin(angle + .5)); ctx.closePath();
      ctx.strokeStyle = style.strokeColor; ctx.lineWidth = textOutline(style); if(style.strokeWidth) ctx.stroke(); ctx.fill();
    } else if (operation.tool === "pen") {
      ctx.beginPath(); operation.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      if (operation.points.length === 1) { ctx.arc(a.x, a.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.stroke();
    } else if (operation.tool === "text") {
      // Sizes describe the fitted image; each mark keeps its source-pixel scale.
      ctx.font = textFont(style); ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.strokeStyle = style.strokeColor; ctx.lineWidth = textOutline(style);
      String(operation.text || "").split("\n").forEach((line, i) => {
        const y = a.y + i * textPixels(style) * 1.25;
        if(style.strokeWidth) ctx.strokeText(line, a.x, y); ctx.fillText(line, a.x, y);
      });
    }
    ctx.restore();
  };
  App.openPendingImageEditor = async function (pending) {
    if (!pending || pending.kind !== "image" || !App.pendingFiles.includes(pending)) return;
    let closed = false, bitmap = null, frame = 0, active = null, saving = false, textDraft = null, toolPanel = null;
    const restored = pending.fileObject && App.pendingImageEditDocuments.get(pending.fileObject);
    let operations = restored?.operations.slice() || [], history = [], future = [], selectedId = null, styleEditId = null, serial = 0;
    let tool = "pan", zoom = 1, pan = {x:0,y:0}, fitted = 1;
    let source = restored?.source || pending.fileObject || null;
    let savedSignature = JSON.stringify(operations);
    const newId = () => `annotation-${Date.now()}-${++serial}`;
    const room = App.currentRoomId;
    const tools = [["select","Select"],["pan","Pan"],["crop","Crop"],["arrow","Arrow"],["pen","Draw"],["text","Text"],["redact","Redact"]];
    App.openModal({ title:"Edit Image", size:"media",
      bodyHTML:`<div class="media-viewer image-editor" id="attachment-image-editor">
        <div class="image-editor-toolbar" role="toolbar" aria-label="Image Editing Tools">
          ${tools.map(([id,label]) => `<button class="chat-icon-button image-editor-tool" type="button" data-image-tool="${id}" aria-label="${label}" aria-pressed="${id === tool}" data-tooltip="${label}">${icon(id)}</button>`).join("")}
          <button class="chat-icon-button image-editor-tool" type="button" data-image-action="undo" aria-label="Undo" data-tooltip="Undo" disabled>${icon("undo")}</button>
          <button class="chat-icon-button image-editor-tool" type="button" data-image-action="redo" aria-label="Redo" data-tooltip="Redo" disabled>${icon("redo")}</button>
        </div>
        <div class="image-editor-viewport" data-tool="pan" tabindex="0" aria-label="Image editor. Scroll or pinch to zoom. Use Pan to move the image."><canvas class="image-editor-canvas"></canvas></div>
        <div class="media-zoom-controls" aria-label="Image Zoom Controls">
          <button class="media-zoom-btn" type="button" data-media-zoom="reset" aria-label="Reset Zoom" data-tooltip="Scroll to Zoom · Click to Reset"><span data-media-zoom="percent">100%</span></button>
        </div>
        <div class="image-editor-status" role="status">Loading image…</div>
      </div>`,
      onBeforeClose:() => { App.hideAppTooltip?.(); closed = true; cancelAnimationFrame(frame); observer?.disconnect(); toolPanel?.destroy(); textDraft?.entry.remove(); textDraft=null; bitmap?.close?.(); save.remove(); for(const [name,value] of closeTooltipAttributes) { if(value === null) closeButton.removeAttribute(name); else closeButton.setAttribute(name,value); } delete App.modalEl.dataset.imageEditor; }
    });
    App.modalEl.dataset.imageEditor = "1";
    // The editor only labels its center editing toolbar on hover. Preserve the
    // shared Close control's attributes for other viewers after this one closes.
    const closeButton = App.$("btn-modal-close");
    const closeTooltipAttributes = ["data-tooltip", "title"].map(name => [name, closeButton.getAttribute(name)]);
    closeTooltipAttributes.forEach(([name]) => closeButton.removeAttribute(name));
    const mount = App.$("attachment-image-editor"), viewport = mount.querySelector(".image-editor-viewport"), canvas = mount.querySelector("canvas"), context = canvas.getContext("2d");
    const selectionColor = getComputedStyle(canvas).color;
    const status = mount.querySelector(".image-editor-status"), zoomButton = mount.querySelector('[data-media-zoom="reset"]'), zoomReadout = mount.querySelector('[data-media-zoom="percent"]'), zoomControls = mount.querySelector(".media-zoom-controls");
    const save = document.createElement("button"); save.type = "button"; save.id = "btn-image-editor-save"; save.className = "modal-close modal-supplemental-action image-editor-save-action";
    save.setAttribute("aria-label", "Save Image Edits"); save.innerHTML = icon("save"); save.disabled = true;
    closeButton.before(save);
    // A reduced preview canvas keeps interactive drawing inexpensive. Save renders at original resolution.
    let fullWidth = 0, fullHeight = 0, crop = null, previewRatio = 1;
    const base = document.createElement("canvas"), baseContext = base.getContext("2d");
    const pointers = new Map(); let pinch = null;
    const selection = () => {
      let area = {x:0,y:0,w:fullWidth,h:fullHeight};
      for (const op of operations) if (op.tool === "crop") area = op.rect;
      return area;
    };
    const hasDraft = () => !!textDraft?.entry.value.trim();
    const dirty = () => {
      save.disabled = saving || !bitmap || (!hasDraft() && JSON.stringify(operations) === savedSignature);
      mount.querySelector('[data-image-action="undo"]').disabled = saving || !(history.length || hasDraft());
      mount.querySelector('[data-image-action="redo"]').disabled = saving || !future.length;
    };
    const styleFor = name => ({...editStyle(toolPanel?.getStyle(name)),unitScale:1/Math.max(.001,fitted*previewRatio)});
    const selected = () => operations.find(op=>op.id===selectedId);
    function showSelection() {
      if(tool!=="select")return;
      const op=selected(); toolPanel?.selectTool(op?.tool || "select",op ? editStyle(op.style) : null);
      mount.dataset.selectedObject=op?.tool || "";
    }
    function changeOperations(next) {
      history.push(operations); operations=next; future=[]; styleEditId=null;
      if(!selected())selectedId=null; paintBase(); showSelection();
    }
    function selectAt(p) {
      const tolerance=6/Math.max(.001,fitted*previewRatio*zoom);
      const op=operations.slice().reverse().find(op=>["text","arrow","pen"].includes(op.tool)&&hitObject(op,p,context,tolerance));
      selectedId=op?.id || null; styleEditId=null; showSelection(); queuePaint(); return op;
    }
    function positionTextEntry() {
      if (!textDraft || !crop) return;
      const {entry, operation} = textDraft, style = operation.style;
      const r = canvas.getBoundingClientRect(), v = viewport.getBoundingClientRect(), m = mount.getBoundingClientRect(), scale = r.width / crop.w;
      // Keep typing legible even when a large screenshot is fitted down. The
      // committed annotation keeps its fitted-image size in source pixels.
      const fontSize = Math.max(16, textPixels(style) * scale);
      const lines = entry.value.split("\n");
      context.save(); context.font = `${fontSize}px Arial, sans-serif`;
      const measured = Math.max(...lines.map(line => context.measureText(line).width), fontSize * 6);
      context.restore();
      const anchorLeft = r.left - v.left + (operation.a.x - crop.x) * scale;
      const anchorTop = r.top - v.top + (operation.a.y - crop.y) * scale;
      const width = Math.min(Math.max(100, measured + fontSize), Math.max(1,v.width-18));
      const height = Math.min(Math.max(fontSize * 1.25, lines.length * fontSize * 1.25), Math.max(1,Math.min(240,v.height-18)));
      // The entry is a movable typing affordance; moving it away from an edge
      // must not change the annotation's original-image anchor.
      const left = clamp(anchorLeft,8,Math.max(8,v.width-width-10));
      const top = clamp(anchorTop,8,Math.max(8,v.height-height-10));
      Object.assign(entry.style, {
        left:`${v.left-m.left+left}px`, top:`${v.top-m.top+top}px`, font:`${fontSize}px Arial, sans-serif`, lineHeight:"1.25",
        color:style.color, webkitTextStroke:`${textOutline(style) * fontSize / textPixels(style)}px ${style.strokeColor}`,
        paintOrder:"stroke fill", width:`${width}px`, height:`${height}px`, overflowX:"auto", overflowY:"auto"
      });
      // Generic phone form fields force 16px; annotation typing must preview
      // its chosen size instead of looking tiny until it is committed.
      entry.style.setProperty("font-size", `${fontSize}px`, "important");
    }
    function finishText(commit = true) {
      if (!textDraft) return;
      const {entry, operation, original} = textDraft; textDraft=null; entry.remove();
      if (commit && entry.value.trim()) {
        const next={...operation,text:entry.value};
        if(JSON.stringify(next)!==JSON.stringify(original)) changeOperations(original ? operations.map(op=>op.id===original.id?next:op) : [...operations,next]);
        else paintBase();
      } else paintBase();
    }
    function beginText(anchor, original = null) {
      finishText();
      const entry = document.createElement("textarea");
      entry.className="image-editor-text-entry";entry.setAttribute("aria-label","Image Annotation Text");
      entry.placeholder="Type text";entry.spellcheck=false;entry.wrap="off";entry.maxLength=10000;
      entry.value=original?.text || "";
      textDraft={entry,original,operation:original ? {...original,style:{...original.style}} : {id:newId(),tool:"text",a:{...anchor},style:styleFor("text")}};
      entry.addEventListener("input",()=>{positionTextEntry();dirty();});
      entry.addEventListener("keydown",event=>{
        if(event.isComposing)return;
        if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();finishText(false);viewport.focus({preventScroll:true});}
        else if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();event.stopPropagation();finishText();viewport.focus({preventScroll:true});}
      });
      mount.appendChild(entry);paintBase();positionTextEntry();entry.focus({preventScroll:true});dirty();
    }
    toolPanel = App.createImageEditorToolPanel({mount,onChange:(name,values)=>{
      if(saving)return;
      if(textDraft) { textDraft.operation.style={...editStyle(values),unitScale:textDraft.operation.style.unitScale};positionTextEntry();dirty();return; }
      const op=tool==="select"&&selected();if(!op)return;
      const next={...op,style:{...editStyle(values),unitScale:op.style.unitScale}};
      if(JSON.stringify(next)===JSON.stringify(op))return;
      if(styleEditId!==op.id){history.push(operations);styleEditId=op.id;}
      operations=operations.map(item=>item.id===op.id?next:item);future=[];paintBase();
    },onEditText:()=>{const op=selected();if(op?.tool==="text"&&!saving)beginText(op.a,op);}});
    const options=mount.querySelector(".image-editor-options");
    options.addEventListener("pointerdown",()=>{styleEditId=null;});
    options.addEventListener("focusin",()=>{styleEditId=null;});
    function transform() {
      if (!crop) return;
      const r = viewport.getBoundingClientRect();
      // Use layout dimensions, not the modal's transient opening transform,
      // when establishing the fitted-image units stored with an annotation.
      fitted = Math.min(1, Math.max(1,viewport.clientWidth - 32) / canvas.width, Math.max(1,viewport.clientHeight - 120) / canvas.height);
      const scale = fitted * zoom;
      pan.x = clamp(pan.x, -Math.max(0,(canvas.width*scale-r.width)/2), Math.max(0,(canvas.width*scale-r.width)/2));
      pan.y = clamp(pan.y, -Math.max(0,(canvas.height*scale-r.height)/2), Math.max(0,(canvas.height*scale-r.height)/2));
      canvas.style.transform = `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`;
      zoomReadout.textContent = `${Math.round(zoom * 100)}%`;
      App.updateMediaZoomOverlap?.(zoomControls, [canvas], viewport);
      positionTextEntry();
    }
    function paintBase() {
      if (!bitmap || closed) return;
      crop = selection(); previewRatio = Math.min(1, 1920 / Math.max(crop.w,crop.h));
      canvas.width = base.width = Math.max(1,Math.round(crop.w * previewRatio));
      canvas.height = base.height = Math.max(1,Math.round(crop.h * previewRatio));
      baseContext.setTransform(previewRatio,0,0,previewRatio,-crop.x*previewRatio,-crop.y*previewRatio);
      baseContext.clearRect(crop.x,crop.y,crop.w,crop.h);
      baseContext.drawImage(bitmap,0,0);
      for (const op of operations) if(op.id!==textDraft?.original?.id) App.paintImageEdit(baseContext,op,fullWidth,fullHeight);
      transform(); paint(); dirty();
    }
    function paint() {
      frame = 0; if (!bitmap || closed) return;
      context.setTransform(1,0,0,1,0,0); context.clearRect(0,0,canvas.width,canvas.height); context.drawImage(base,0,0);
      const chosen=tool==="select"&&selected();
      if(chosen&&!textDraft) {
        const box=App.imageEditObjectBounds(chosen,context), unit=1/Math.max(.001,previewRatio*fitted*zoom);
        context.save();context.setTransform(previewRatio,0,0,previewRatio,-crop.x*previewRatio,-crop.y*previewRatio);
        context.strokeStyle=selectionColor;context.lineWidth=1.5*unit;context.setLineDash([5*unit,3*unit]);
        context.strokeRect(box.x-3*unit,box.y-3*unit,box.w+6*unit,box.h+6*unit);context.restore();
      }
      if (active?.operation) {
        const op = active.operation;
        context.save(); context.setTransform(previewRatio,0,0,previewRatio,-crop.x*previewRatio,-crop.y*previewRatio);
        if (op.tool === "crop") {
          const r = App.imageEditRectangle(op.a,op.b,fullWidth,fullHeight);
          context.fillStyle = "#0007";
          context.beginPath(); context.rect(crop.x,crop.y,crop.w,crop.h); context.rect(r.x,r.y,r.w,r.h); context.fill("evenodd");
          context.strokeStyle = "#ffffff"; context.lineWidth = 1.5 / previewRatio; context.setLineDash([5 / previewRatio, 4 / previewRatio]); context.strokeRect(r.x,r.y,r.w,r.h);
        } else App.paintImageEdit(context,op,fullWidth,fullHeight);
        context.restore();
      }
    }
    const queuePaint = () => { if (!frame) frame = requestAnimationFrame(paint); };
    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return {x:clamp(crop.x + (event.clientX-rect.left)/rect.width*crop.w,crop.x,crop.x+crop.w),y:clamp(crop.y + (event.clientY-rect.top)/rect.height*crop.h,crop.y,crop.y+crop.h)};
    }
    function setZoom(value, x, y) {
      const next = clamp(value,1,20), r = viewport.getBoundingClientRect(), cx = x-r.left-r.width/2, cy = y-r.top-r.height/2;
      pan.x = cx-(cx-pan.x)*next/zoom; pan.y = cy-(cy-pan.y)*next/zoom; zoom = next; transform();
    }
    function choose(next) {
      finishText();
      if(active?.move) { operations=active.before;paintBase(); }
      tool = next; active = null; selectedId=null;styleEditId=null;delete mount.dataset.selectedObject; viewport.dataset.tool = tool;
      toolPanel?.selectTool(tool);
      mount.querySelectorAll('[data-image-tool]').forEach(b => b.setAttribute("aria-pressed",String(b.dataset.imageTool === tool)));
      status.textContent = tool === "pan" ? "Scroll or pinch to zoom · Drag to pan · Save keeps your edits" : tool === "crop" ? "Drag around the area to keep" : tool === "redact" ? "Drag a solid black box over private details" : tool === "select" ? "Click an annotation to select it. Drag to move it." : tool === "text" ? "Click the image to add text" : `Drag to ${tool === "arrow" ? "add an arrow" : "draw"}`;
      queuePaint();
    }
    mount.querySelectorAll('[data-image-tool]').forEach(b => b.onclick = () => { if (!saving) choose(b.dataset.imageTool); });
    function undo() { if(saving)return;finishText();if(!history.length)return;future.push(operations);operations=history.pop();selectedId=null;styleEditId=null;active=null;paintBase();showSelection(); }
    function redo() { if(saving)return;finishText();if(!future.length)return;history.push(operations);operations=future.pop();selectedId=null;styleEditId=null;active=null;paintBase();showSelection(); }
    mount.querySelector('[data-image-action="undo"]').onclick=undo; mount.querySelector('[data-image-action="redo"]').onclick=redo;
    zoomButton.onclick = () => { zoom=1; pan={x:0,y:0}; transform(); };
    viewport.addEventListener("wheel", e => { if (!bitmap || e.target.closest(".image-editor-text-entry")) return; e.preventDefault(); if(e.deltaY) setZoom(App.nextMediaZoomScale(zoom,e.deltaY<0?1:-1,20),e.clientX,e.clientY); },{passive:false});
    viewport.addEventListener("pointerdown", e => {
      if (!bitmap || saving || e.target.closest(".image-editor-text-entry") || (e.pointerType !== "touch" && e.button !== 0)) return;
      finishText();
      e.preventDefault(); viewport.focus({preventScroll:true}); viewport.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (pointers.size === 2) {
        if(active?.move) { operations=active.before;paintBase(); }
        const [a,b] = [...pointers.values()]; pinch={distance:Math.hypot(b.x-a.x,b.y-a.y),zoom}; active=null; queuePaint(); return;
      }
      const r=canvas.getBoundingClientRect();
      if (tool !== "pan" && (e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)) return;
      const p=point(e);
      if(tool==="select") {
        const op=selectAt(p);active=op ? {pointer:e.pointerId,move:op,startPoint:p,before:operations} : null;return;
      }
      active = {pointer:e.pointerId,start:{x:e.clientX,y:e.clientY},pan:{...pan},textAnchor:tool === "text" ? p : null,operation:tool === "pan" || tool === "text" ? null : {id:newId(),tool,a:p,b:p,points:[p],style:styleFor(tool)}};
      queuePaint();
    });
    viewport.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (pinch && pointers.size===2) { const [a,b]=[...pointers.values()]; setZoom(pinch.zoom*Math.hypot(b.x-a.x,b.y-a.y)/Math.max(1,pinch.distance),(a.x+b.x)/2,(a.y+b.y)/2); return; }
      if (!active || active.pointer!==e.pointerId) return;
      if(active.move) {
        const p=point(e),dx=p.x-active.startPoint.x,dy=p.y-active.startPoint.y,op=active.move;
        const movePoint=p=>({x:p.x+dx,y:p.y+dy});
        const next={...op,a:movePoint(op.a),...(op.b?{b:movePoint(op.b)}:{}),...(op.points?{points:op.points.map(movePoint)}:{})};
        operations=active.before.map(item=>item.id===op.id?next:item);active.moved=Math.hypot(dx,dy)>0;paintBase();return;
      }
      if (active.textAnchor) { active.moved = Math.hypot(e.clientX-active.start.x,e.clientY-active.start.y) > 5; return; }
      if (!active.operation) { pan={x:active.pan.x+e.clientX-active.start.x,y:active.pan.y+e.clientY-active.start.y}; transform(); return; }
      const op=active.operation; op.b=point(e);
      if (op.tool === "pen" && op.points.length < 10000) {
        const previous=op.points.at(-1); if(Math.hypot(previous.x-op.b.x,previous.y-op.b.y)>1/previewRatio) op.points.push(op.b);
      }
      queuePaint();
    });
    function release(e) {
      pointers.delete(e.pointerId); if(pointers.size<2) pinch=null;
      if (active?.pointer === e.pointerId) {
        if(active.move) {
          const previous=active;active=null;
          if(e.type==="pointerup"&&previous.moved){history.push(previous.before);future=[];styleEditId=null;}
          else operations=previous.before;
          paintBase();return;
        }
        const op=active.operation, anchor=active.textAnchor, moved=active.moved; active=null;
        if (anchor && !moved && e.type === "pointerup") { beginText(anchor); return; }
        if (op && e.type === "pointerup") {
          if(op.tool === "crop") { op.rect=App.imageEditRectangle(op.a,op.b,fullWidth,fullHeight); if(op.rect.w<3||op.rect.h<3) { queuePaint(); return; } zoom=1; pan={x:0,y:0}; }
          changeOperations([...operations,op]);
        } else queuePaint();
      }
    }
    viewport.addEventListener("dblclick",e=>{if(tool!=="select"||saving)return;finishText();const op=selectAt(point(e));if(op?.tool==="text")beginText(op.a,op);});
    viewport.addEventListener("pointerup",release); viewport.addEventListener("pointercancel",release); viewport.addEventListener("lostpointercapture",release);
    mount.addEventListener("keydown", e => {
      if (e.target.closest("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return;
      if(["+","=","-","_","0"].includes(e.key)) {
        e.preventDefault();const r=viewport.getBoundingClientRect();setZoom(e.key==="0"?1:App.nextMediaZoomScale(zoom,["+","="].includes(e.key)?1:-1,20),r.left+r.width/2,r.top+r.height/2);return;
      }
      if(e.key==="Escape"&&tool==="select"){selectedId=null;showSelection();queuePaint();}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z") { e.preventDefault(); e.shiftKey?redo():undo(); }
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y") { e.preventDefault(); redo(); }
    });
    const observer=new ResizeObserver(transform); observer.observe(viewport);
    save.onclick = async () => {
      if (closed || saving || !bitmap) return;
      finishText();
      if (JSON.stringify(operations) === savedSignature) return;
      saving=true; dirty(); App.modalEl.dataset.busy="1"; status.textContent="Saving image…";
      try {
        const output=document.createElement("canvas"); const area=selection(); output.width=area.w; output.height=area.h;
        const ctx=output.getContext("2d"); ctx.translate(-area.x,-area.y); ctx.drawImage(bitmap,0,0);
        for(const op of operations) App.paintImageEdit(ctx,op,fullWidth,fullHeight);
        const blob=await new Promise((resolve,reject)=>output.toBlob(value=>value?resolve(value):reject(new Error("Image could not be saved.")),"image/png"));
        output.width=output.height=1;
        if(closed || room!==App.currentRoomId || !App.pendingFiles.includes(pending)) throw new Error("This attachment is no longer in the composer.");
        if(App.isChatAttachmentOverSizeLimit(blob)) throw new Error(`The edited image exceeds the ${App.CHAT_FILE_MAX_LABEL} upload limit.`);
        if(closed || room!==App.currentRoomId || !App.pendingFiles.includes(pending)) throw new Error("This attachment is no longer in the composer.");
        const name=String(pending.fileName||pending.name||"Screenshot").replace(/\.[^.]+$/,"")+".png";
        const file=new File([blob],name,{type:"image/png",lastModified:Date.now()}), old=pending.previewURL;
        const replacement={...pending, fileObject:file, fileName:name, name, type:file.type, mimeType:file.type, size:file.size, previewURL:URL.createObjectURL(file)};
        // Remove old encoded payloads so every upload/sticker path reads the edited pixels.
        for(const key of Object.keys(replacement)) if(/^dataURL(?:$|_)/.test(key)||key==="storagePath") delete replacement[key];
        App.pendingFiles[App.pendingFiles.indexOf(pending)]=replacement; pending=replacement;
        if(String(old||"").startsWith("blob:")) URL.revokeObjectURL(old);
        // Keep editable layers local to this pending File. Uploads still use only
        // its flattened PNG; the original and layer data never leave the editor.
        App.pendingImageEditDocuments.set(file,{source,operations:operations.slice()});
        savedSignature=JSON.stringify(operations);paintBase();App.renderFilesBar();App.syncChatOverlayMetrics?.();
        status.textContent="Saved to attachment. You can close this viewer.";
      } catch(error) { status.textContent=error.message || "Could not save image. Your original is unchanged."; App.showToast?.({title:"Image Could Not Be Saved",body:status.textContent,duration:5000}); }
      finally { saving=false; if(!closed) { delete App.modalEl.dataset.busy; dirty(); } }
    };
    try {
      const encoded=App.readChunkedField(pending,"dataURL") || pending.previewURL;
      const input=source || (encoded ? await (await fetch(encoded)).blob() : null);
      if(!input) throw new Error("Image data is no longer available.");
      source=input;
      bitmap=await createImageBitmap(input,{imageOrientation:"from-image"});
      if(closed) {bitmap.close();return;}
      fullWidth=bitmap.width;fullHeight=bitmap.height;
      // The input upload limit remains unchanged; reject unrenderable pixel allocations explicitly.
      if(fullWidth*fullHeight>64000000) throw new Error("This image is too large to edit here. Resize it below 64 megapixels first.");
      paintBase();choose("pan"); mount.dataset.ready = "1";
    } catch(error) {
      bitmap?.close?.(); bitmap=null;
      if(!closed) { dirty(); status.textContent=error.message || "This image cannot be edited."; App.showToast?.({title:"Image Editor Unavailable",body:status.textContent,duration:5000}); }
    }
  };
  App.register("media/image-editor", function () {});
})(globalThis.ChatApp);
