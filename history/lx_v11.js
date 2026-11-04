/*!
 * @name 圈圈音源
 * @description oiapi 聚合源 v11（酷我直连，秒出 320k）
 * @version 11
 * @author 圈圈
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;

  var KW_API = 'https://oiapi.net/api/Kuwo';

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

  lx.on(EV.request, function(payload){
    if (payload.action !== 'musicUrl') throw new Error('bad action ' + payload.action);
    var info = payload.info || {};
    var name = info.name || '';
    var singer = info.singer || '';
    if (!name) return Promise.reject(new Error('no song name'));

    var kw = encodeURIComponent(name + (singer ? ' ' + singer : ''));
    var url = KW_API + '?msg=' + kw + '&n=1&type=json';

    return httpOnce(url, { method:'GET' }, 12000).then(function(resp){
      var body = resp.body;
      var o = toObj(body);
      if (!o || !o.data) throw new Error('bad resp');
      var u = o.data.url;
      if (!u) throw new Error('no url');
      // 音质调整
      var q = info.type || '128k';
      if (q === '320k' && u.indexOf('bitrate$128') >= 0) u = u.replace('bitrate$128', 'bitrate$320');
      if (q === 'flac' && u.indexOf('bitrate$') >= 0 && u.indexOf('.mp3') >= 0){
        // flac 不可得时退回 320k 保证能播
        u = u.replace('bitrate$128', 'bitrate$320');
      }
      return u;
    });
  });
})();
