/*!
 * @name 圈圈探针
 * @description dump info keys
 * @version 2
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;
  lx.send(EV.inited, {
    sources: {
      kw: { name:'酷我', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      mg: { name:'咪咕', type:'music', actions:['musicUrl'], qualitys:['128k','320k'] },
      tx: { name:'QQ', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      wy: { name:'网易', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      kg: { name:'酷狗', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] }
    }
  });
  lx.on(EV.request, function(payload){
    var info = payload.info || {};
    var keys = [];
    for (var k in info){ keys.push(k + '=' + String(info[k]).slice(0, 40)); }
    throw new Error('DUMPINFO::' + keys.join(' | '));
  });
})();
