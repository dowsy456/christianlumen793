'use strict';
// Publisher/developer utility only; never run by the app. Restore the untouched
// duplicate save/ tree from the supplied ZIP to a separate, empty destination.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
async function restore(destination) {
  if (!destination) throw new Error('Usage: node scripts/restore-saved-source.cjs <new-directory-outside-source>');
  const source = path.resolve(__dirname, '..'), target = path.resolve(destination);
  if (target === source || target.startsWith(source + path.sep)) throw new Error('Restore outside the active source tree.');
  await fs.mkdir(target, { recursive:true });
  if ((await fs.readdir(target)).length) throw new Error('The restore destination must be empty.');
  const files = require('./saved-source-map.json');
  for (const entry of files) {
    const from = path.resolve(source,entry.stored), to = path.resolve(target,entry.original);
    if (!from.startsWith(source + path.sep) || !to.startsWith(target + path.sep)) throw new Error('Unsafe saved path');
    const bytes = await fs.readFile(from);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Saved source changed: '+entry.stored);
    await fs.mkdir(path.dirname(to), {recursive:true}); await fs.writeFile(to,bytes,{flag:'wx'});
  }
  console.log(`Restored ${files.length} original files with all original relative references at ${path.join(target,'save')}`);
}
if(require.main===module) restore(process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={restore};
