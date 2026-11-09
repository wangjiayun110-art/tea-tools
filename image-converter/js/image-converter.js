/* Free image converter: converts images entirely in the browser.
   WebP / PNG / JPG / AVIF / GIF / BMP go through canvas.
   HEIC / HEIF go through heic2any (loaded only when a HEIC file appears).
   Nothing is uploaded anywhere. */
(function(){
  var box = document.querySelector('[data-converter]');
  if (!box) return;

  var input = box.querySelector('.ic-file');
  var drop = box.querySelector('.ic-drop');
  var outBtns = box.querySelectorAll('.ic-out');
  var qualityRow = box.querySelector('.ic-quality-row');
  var quality = box.querySelector('.ic-quality');
  var qualityVal = box.querySelector('.ic-quality-val');
  var convertBtn = box.querySelector('.ic-convert');
  var clearBtn = box.querySelector('.ic-clear');
  var zipBtn = box.querySelector('.ic-zip');
  var list = box.querySelector('.ic-list');
  var note = box.querySelector('.ic-note');

  var outType = box.getAttribute('data-preset-to') || 'jpg';
  var busy = false;
  var files = []; /* {file, outBlob, outName, url, error} */

  var MIME = {jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp'};
  var EXT = {jpg: 'jpg', png: 'png', webp: 'webp'};

  function fmtSize(n){
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function baseName(name){ return name.replace(/\.[^.]+$/, '') || 'image'; }
  function isHeic(f){
    return /image\/hei[cf]/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '');
  }
  function loadScript(src){
    return new Promise(function(res, rej){
      if (document.querySelector('script[src="' + src + '"]')) return res();
      var s = document.createElement('script');
      s.src = src; s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function canvasConvert(blob, type, q){
    return createImageBitmap(blob).then(function(bmp){
      var c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      var ctx = c.getContext('2d');
      if (type === 'image/jpeg'){ ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(bmp, 0, 0);
      return new Promise(function(res, rej){
        c.toBlob(function(b){ b ? res(b) : rej(new Error('This image could not be converted.')); }, type, q);
      });
    });
  }
  function heicConvert(file, type, q){
    return loadScript('js/heic2any.min.js').then(function(){
      if (!window.heic2any) throw new Error('HEIC support failed to load.');
      if (type === 'image/webp'){
        return window.heic2any({blob: file, toType: 'image/png'}).then(function(png){
          var b = Array.isArray(png) ? png[0] : png;
          return canvasConvert(b, 'image/webp', q);
        });
      }
      return window.heic2any({blob: file, toType: type, quality: q}).then(function(out){
        return Array.isArray(out) ? out[0] : out;
      });
    });
  }
  function convertOne(item){
    var type = MIME[outType];
    var q = (outType === 'png') ? undefined : (parseInt(quality.value, 10) / 100);
    var job = isHeic(item.file) ? heicConvert(item.file, type, q) : canvasConvert(item.file, type, q);
    return job.then(function(blob){
      item.outBlob = blob;
      item.outName = baseName(item.file.name) + '.' + EXT[outType];
      item.outSize = blob.size;
      item.url = URL.createObjectURL(blob);
      item.error = '';
    }).catch(function(e){
      item.error = e && e.message ? e.message : 'Conversion failed.';
    });
  }
  function render(){
    list.innerHTML = '';
    var done = 0;
    files.forEach(function(item, i){
      var row = document.createElement('div');
      row.className = 'ic-row';
      var left = document.createElement('div');
      left.className = 'ic-fileinfo';
      var name = document.createElement('div');
      name.className = 'ic-name';
      name.textContent = item.file.name + ' (' + fmtSize(item.file.size) + ')';
      left.appendChild(name);
      if (item.error){
        var err = document.createElement('div');
        err.className = 'ic-err';
        err.textContent = item.error;
        left.appendChild(err);
      } else if (item.outBlob){
        var ok = document.createElement('div');
        ok.className = 'ic-ok';
        ok.textContent = '→ ' + item.outName + ' (' + fmtSize(item.outSize) + ')';
        left.appendChild(ok);
        done++;
      } else {
        var wait = document.createElement('div');
        wait.className = 'ic-wait';
        wait.textContent = 'Waiting to convert…';
        left.appendChild(wait);
      }
      row.appendChild(left);
      if (item.url){
        var a = document.createElement('a');
        a.className = 'ic-dl';
        a.href = item.url;
        a.download = item.outName;
        a.textContent = 'Download';
        row.appendChild(a);
      }
      list.appendChild(row);
    });
    zipBtn.style.display = (done > 1) ? '' : 'none';
    clearBtn.style.display = files.length ? '' : 'none';
    convertBtn.disabled = !files.length || busy;
    if (note) note.textContent = files.length ? files.length + ' file' + (files.length > 1 ? 's' : '') + ' ready. Nothing is uploaded — everything happens in your browser.' : '';
  }
  function addFiles(list2){
    var added = 0;
    for (var i = 0; i < list2.length; i++){
      var f = list2[i];
      if (files.length >= 50) break;
      if (!/image|hei[cf]/i.test(f.type || '') && !/\.(jpe?g|png|webp|avif|gif|bmp|hei[cf]|hif)$/i.test(f.name || '')) continue;
      if (f.size > 50 * 1024 * 1024) continue;
      files.push({file: f, outBlob: null, outName: '', url: '', error: ''});
      added++;
    }
    if (added) render();
  }
  function setOut(t){
    outType = t;
    outBtns.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-out') === t); });
    qualityRow.style.display = (t === 'png') ? 'none' : '';
    files.forEach(function(item){ item.outBlob = null; item.url = ''; item.error = ''; });
    render();
  }
  outBtns.forEach(function(b){
    b.onclick = function(){ setOut(b.getAttribute('data-out')); };
  });
  quality.addEventListener('input', function(){ qualityVal.textContent = quality.value + '%'; });
  input.addEventListener('change', function(){ addFiles(input.files); input.value = ''; });
  drop.addEventListener('click', function(){ input.click(); });
  ['dragover', 'dragenter'].forEach(function(ev){
    drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function(ev){
    drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('drag'); });
  });
  drop.addEventListener('drop', function(e){ addFiles(e.dataTransfer.files); });
  convertBtn.onclick = function(){
    if (!files.length || busy) return;
    busy = true;
    convertBtn.disabled = true;
    convertBtn.textContent = 'Converting…';
    var chain = Promise.resolve();
    files.forEach(function(item){
      chain = chain.then(function(){ return convertOne(item).then(render); });
    });
    chain.then(function(){
      busy = false;
      convertBtn.disabled = false;
      convertBtn.textContent = 'Convert again';
      render();
    });
  };
  clearBtn.onclick = function(){
    files.forEach(function(item){ if (item.url) URL.revokeObjectURL(item.url); });
    files = [];
    render();
  };
  zipBtn.onclick = function(){
    var done = files.filter(function(item){ return item.outBlob; });
    if (done.length < 2) return;
    zipBtn.disabled = true;
    zipBtn.textContent = 'Making zip…';
    loadScript('js/jszip.min.js').then(function(){
      var zip = new JSZip();
      done.forEach(function(item){ zip.file(item.outName, item.outBlob); });
      return zip.generateAsync({type: 'blob'});
    }).then(function(blob){
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'converted-images.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      zipBtn.disabled = false;
      zipBtn.textContent = 'Download all (.zip)';
    }).catch(function(){
      zipBtn.disabled = false;
      zipBtn.textContent = 'Download all (.zip)';
      alert('The zip could not be made. Download the files one by one instead.');
    });
  };
  setOut(outType);
  qualityVal.textContent = quality.value + '%';
})();
