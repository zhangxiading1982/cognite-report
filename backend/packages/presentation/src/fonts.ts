/** PPT font names are stored verbatim; CSS fallbacks only affect the browser. */
export const FONT_OPTIONS = [
 {id:'SimHei',label:'黑体 / SimHei',css:'SimHei, "Heiti SC", "PingFang SC", sans-serif'},
 {id:'Microsoft YaHei',label:'微软雅黑 / Microsoft YaHei',css:'"Microsoft YaHei", SimHei, "PingFang SC", sans-serif'},
 {id:'SimSun',label:'宋体 / SimSun',css:'SimSun, "Songti SC", serif'},
 {id:'PingFang SC',label:'苹方 / PingFang SC',css:'"PingFang SC", SimHei, "PingFang SC", sans-serif'},
 {id:'Arial',label:'Arial',css:'Arial, SimHei, "PingFang SC", sans-serif'},
 {id:'Calibri',label:'Calibri',css:'Calibri, Arial, SimHei, "PingFang SC", sans-serif'},
 {id:'Aptos',label:'Aptos',css:'Aptos, Arial, SimHei, "PingFang SC", sans-serif'},
 {id:'Times New Roman',label:'Times New Roman',css:'"Times New Roman", "Songti SC", serif'},
];
export const fontCss = (id:string) => FONT_OPTIONS.find(f=>f.id===id)?.css ?? 'SimHei, "PingFang SC", sans-serif';
