import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),src=resolve(root,'plugin-packages/multi-platform-notify'),out=resolve(root,'dist');
const manifest=JSON.parse(await readFile(resolve(src,'manifest.json'),'utf8')),files={};
async function walk(dir){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=resolve(dir,entry.name);if(entry.isDirectory())await walk(path);else if(!['checksums.json','signature.json','.DS_Store'].includes(entry.name))files[relative(src,path).split('\\').join('/')]=createHash('sha256').update(await readFile(path)).digest('hex');}}
await walk(src);await writeFile(resolve(src,'checksums.json'),JSON.stringify({algorithm:'SHA-256',files},null,2)+'\n');await mkdir(out,{recursive:true});
const filename=`multi-platform-notify-v${manifest.version}.zip`,result=spawnSync('zip',['-qrX',resolve(out,filename),'.','-x','*.DS_Store'],{cwd:src,stdio:'inherit'});if(result.status!==0)throw new Error('组件打包失败');
await writeFile(resolve(out,'manifest.json'),JSON.stringify({filename,version:'v'+manifest.version},null,2)+'\n');process.stdout.write(`已打包：dist/${filename}（${Object.keys(files).length} 个文件）\n`);
const sourceName=`multi-platform-notify-source-v${manifest.version}.zip`;
const sourceResult=spawnSync('zip',['-qrX',resolve(out,sourceName),'README.md','package.json','bridge/server.mjs','bridge/config.example.json','scripts','test','plugin-packages','-x','*.DS_Store'],{cwd:root,stdio:'inherit'});
if(sourceResult.status!==0)throw new Error('源码包打包失败');
process.stdout.write(`已打包：dist/${sourceName}（含 OpenClaw 桥接与接入指南）\n`);
