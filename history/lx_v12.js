/*!
 * @name 圈圈音源
 * @description oiapi 聚合源 v12（多接口兜底）
 * @version 12
 * @author 圈圈
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;

  var API = 'https://oiapi.net/api/';

  function toObj(v){
    if (typeof v === 'string'){ try { return JSON.parse(v); } catch(e){ return null; } }
    return (v && typeof v === 'object') ? v : null;
  }
  function httpOnce(url, opts, ms){
    return new Promise(function(resolve, reject){
      var done = false;
      var timer = setTimeout(function(){
        if (done) return; done = true;
        reject(new Error('timeout'));
      }, ms || 12000);
      try {
        lx.request(url, opts || { method:'GET' }, function(err, resp){
          if (done) return; done = true; clearTimeout(timer);
          if (resp && resp.body) return resolve(resp);
          reject(new Error('net:' + String(err).slice(0,40)));
        });
      } catch(e){
        if (done) return; done = true; clearTimeout(timer);
        reject(e);
      }
    });
  }

  lx.send(EV.inited, {
    sources: {
      kw: { name:'酷我音乐', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] }
    }
  });

  // 从 oiapi 响应里挖 url，格式不固定所以多路尝试
  function pickUrl(raw){
    var o = toObj(raw);
    if (o){
      if (o.data && o.data.url) return o.data.url;
      if (o.url) return o.url;
    }
    // 字符串里找
    var s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    var m = s.match(/"url"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
    m = s.match(/(https?:\/\/[^\s"'\u00b1,]+)/);
    if (m) return m[1];
    return null;
  }

  lx.on(EV.request, function(payload){
    if (payload.action !== 'musicUrl') throw new Error('bad action ' + payload.action);
    var info = payload.info || {};

    var name = info.name || info.songName || '';
    var singer = info.singer || '';
    var meta = info.meta || {};

    // LX 有时把名字放在别处
    if (!name && meta.name) name = meta.name;
    if (!name) return Promise.reject(new Error('no name'));

    var tries = [];
    var full = name + (singer ? ' ' + singer : '');
    tries.push(full);
    if (singer) tries.push(name);
    if (meta.albumName) tries.push(name + ' ' + meta.albumName);

    var i = 0;
    function step(){
      if (i >= tries.length) return Promise.reject(new Error('all tries failed'));
      var q = encodeURIComponent(tries[i++]);
      return httpOnce(API + 'Kuwo?msg=' + q + '&n=1&type=json', { method:'GET' }, 12000)
        .then(function(resp){
          var u = pickUrl(resp.body);
          if (!u) throw new Error('no url');
          var type = info.type || '128k';
          if (type === '320k' && u.indexOf('bitrate$128') >= 0) u = u.replace('bitrate$128', 'bitrate$320');
          return u;
        })
        .catch(function(e){
          if (i >= tries.length) throw e;
          return step();
        });
    }
    return step();
  });
})();
