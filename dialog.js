/* Arian — Material Dialog (confirm / alert / prompt) — theme-aware */
(function(){
  "use strict";
  var dlg = null, iconEl, titleEl, msgEl, inputEl, input2El, errEl, cancelBtn, confirmBtn;
  var _resolve = null, _mode = null;

  function ensure(){
    if(dlg) return;
    dlg = document.getElementById('m-dialog');
    if(!dlg) return;
    iconEl = document.getElementById('m-dialog-icon');
    titleEl = document.getElementById('m-dialog-title');
    msgEl = document.getElementById('m-dialog-msg');
    inputEl = document.getElementById('m-dialog-input');
    input2El = document.getElementById('m-dialog-input2');
    errEl = document.getElementById('m-dialog-error');
    cancelBtn = document.getElementById('m-dialog-cancel');
    confirmBtn = document.getElementById('m-dialog-confirm');
    dlg.addEventListener('click', function(e){ if(e.target===dlg) close(false); });
    cancelBtn.addEventListener('click', function(){ close(false); });
    confirmBtn.addEventListener('click', function(){ onConfirm(); });
    document.addEventListener('keydown', function(e){
      if(!dlg.hidden && e.key==='Escape'){ e.preventDefault(); close(false); }
      if(!dlg.hidden && e.key==='Enter' && _mode==='confirm'){ onConfirm(); }
    });
    [inputEl, input2El].forEach(function(inp){
      inp.addEventListener('keydown', function(e){
        if(e.key==='Enter'){ e.preventDefault(); onConfirm(); }
      });
    });
  }

  function setIcon(kind){
    if(!iconEl) return;
    iconEl.className='m-dialog-icon '+kind;
    var map={danger:'fa-triangle-exclamation',warn:'fa-triangle-exclamation',info:'fa-circle-info',success:'fa-circle-check'};
    iconEl.innerHTML='<i class="fa-solid '+ (map[kind]||'fa-circle-info') +'"></i>';
  }

  function open(opts){
    ensure();
    if(!dlg) return Promise.resolve(false);
    _mode = opts.mode||'confirm';
    titleEl.textContent = opts.title||'';
    msgEl.textContent = opts.message||'';
    msgEl.style.display = opts.message ? '' : 'none';
    setIcon(opts.icon||'info');
    errEl.textContent=''; errEl.classList.remove('on');
    cancelBtn.textContent = opts.cancelText|| (window.tr?window.tr('dialog.cancel'):'انصراف');
    confirmBtn.textContent = opts.confirmText|| (window.tr?window.tr('dialog.confirm'):'تایید');
    confirmBtn.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
    cancelBtn.style.display = opts.hideCancel ? 'none' : '';
    // inputs
    if(_mode==='prompt' || _mode==='prompt2'){
      inputEl.hidden=false; inputEl.type = opts.inputType||'password';
      inputEl.placeholder = opts.placeholder||''; inputEl.value='';
      inputEl.style.display='';
      if(_mode==='prompt2'){
        input2El.hidden=false; input2El.type=opts.inputType2||'password';
        input2El.placeholder=opts.placeholder2||''; input2El.value=''; input2El.style.display='';
      } else { input2El.hidden=true; input2El.style.display='none'; }
    } else {
      inputEl.hidden=true; inputEl.style.display='none';
      input2El.hidden=true; input2El.style.display='none';
    }
    dlg.hidden=false;
    // force reflow then add class for animation
    void dlg.offsetWidth;
    dlg.classList.add('on');
    document.body.style.overflow='hidden';
    setTimeout(function(){
      if(_mode==='prompt' || _mode==='prompt2') (inputEl.hidden? input2El : inputEl).focus();
      else confirmBtn.focus();
    }, 60);
    return new Promise(function(res){ _resolve=res; });
  }

  function close(val){
    if(!dlg || dlg.hidden) return;
    dlg.classList.remove('on');
    setTimeout(function(){ dlg.hidden=true; dlg.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }, 180);
    if(_resolve){ var r=_resolve; _resolve=null; r(val); }
  }

  function onConfirm(){
    if(_mode==='prompt'){
      var v=inputEl.value.trim();
      if(!v){ errEl.textContent=window.tr?window.tr('dialog.required'):'این فیلد الزامی است'; errEl.classList.add('on'); inputEl.focus(); return; }
      close(v);
    } else if(_mode==='prompt2'){
      var v1=inputEl.value, v2=input2El.value;
      if(!v1){ errEl.textContent=window.tr?window.tr('dialog.oldRequired'):'رمز فعلی الزامی است'; errEl.classList.add('on'); inputEl.focus(); return; }
      if(!v2){ errEl.textContent=window.tr?window.tr('dialog.newRequired'):'رمز جدید الزامی است'; errEl.classList.add('on'); input2El.focus(); return; }
      if(v2.length<6){ errEl.textContent=window.tr?window.tr('dialog.newShort'):'رمز جدید حداقل ۶ کاراکتر باشد'; errEl.classList.add('on'); input2El.focus(); return; }
      close({old:v1, nw:v2});
    } else {
      close(true);
    }
  }

  window.MDialog = {
    confirm: function(opts){ return open(Object.assign({mode:'confirm', icon:'warn', cancelText:window.tr?window.tr('dialog.cancel'):'انصراف', confirmText:window.tr?window.tr('dialog.confirm'):'تایید'}, opts)); },
    alert: function(opts){
      if(typeof opts==='string') opts={message:opts};
      return open(Object.assign({mode:'alert', icon: opts.icon||'info', cancelText:'', confirmText:window.tr?window.tr('dialog.ok'):'باشه', hideCancel:true}, opts));
    },
    prompt: function(opts){ return open(Object.assign({mode:'prompt', icon:'info', cancelText:window.tr?window.tr('dialog.cancel'):'انصراف', confirmText:window.tr?window.tr('dialog.confirm'):'تایید'}, opts)); },
    prompt2: function(opts){ return open(Object.assign({mode:'prompt2', icon:'info'}, opts)); }
  };
})();
