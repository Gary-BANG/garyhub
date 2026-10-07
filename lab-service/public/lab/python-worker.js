let ready;
async function init(){
 importScripts('vendor/pyodide/pyodide.js');
 const py=await loadPyodide({indexURL:new URL('vendor/pyodide/',self.location.href).href});
 await py.loadPackage('numpy');
 const src=await fetch('vendor/modern_robotics.py');if(!src.ok)throw Error('Modern Robotics could not load');
 py.FS.writeFile('/home/pyodide/modern_robotics.py',await src.text());
 await py.runPythonAsync('import numpy, modern_robotics');
 return py;
}
self.onmessage=async ({data})=>{
 const {id,code,names=[]}=data;
 try{
  ready ||= init();const py=await ready;
  if(data.action==='init'){postMessage({id,ready:true});return;}
  py.globals.set('_lab_code',code);py.globals.set('_lab_names',JSON.stringify(names));
  const raw=await py.runPythonAsync(`
import json as _json, io as _io, contextlib as _ctx, traceback as _tb
import numpy as _np
class _LimitedOutput(_io.StringIO):
    def write(self, text):
        left = 16000 - self.tell()
        if left > 0: super().write(text[:left])
        return len(text)
_lab_out = _LimitedOutput()
import modern_robotics as _mr
_lab_ns = {'__name__': '__main__', 'mr': _mr}
_lab_err = None
with _ctx.redirect_stdout(_lab_out), _ctx.redirect_stderr(_lab_out):
    try:
        exec(compile(_lab_code, '<solution>', 'exec'), _lab_ns)
    except BaseException:
        _lab_err = _tb.format_exc(limit=8)
_lab_results = {}
for _name in _json.loads(_lab_names):
    if _name in _lab_ns:
        try:
            _a = _np.asarray(_lab_ns[_name])
            if _a.size > 5000 or _a.dtype.kind not in 'biuf':
                raise ValueError('Expected a real numeric array with at most 5000 elements')
            if not _np.isfinite(_a).all():
                raise ValueError('Answer contains NaN or infinity')
            _lab_results[_name] = {'shape': list(_a.shape), 'values': _a.astype(float).ravel().tolist(), 'nested': _a.tolist()}
        except Exception as _exc:
            _lab_results[_name] = {'error': str(_exc)}
_json.dumps({'output': _lab_out.getvalue(), 'error': _lab_err, 'results': _lab_results})
`);
  postMessage({id,...JSON.parse(raw)});
 }catch(e){postMessage({id,error:String(e),results:{},output:''});}
};
