import fs from 'node:fs';
import path from 'node:path';

const importLine = '#import <React/RCTMessageThread.h>';
const replacement = `#if __has_include(<React/RCTMessageThread.h>)
#import <React/RCTMessageThread.h>
#elif __has_include(<React_Core/RCTMessageThread.h>)
#import <React_Core/RCTMessageThread.h>
#else
#import "RCTMessageThread.h"
#endif`;

const targets = [
  'node_modules/react-native-worklets/apple/worklets/apple/WorkletsMessageThread.h',
  'ios/Pods/Headers/Public/RNWorklets/worklets/apple/WorkletsMessageThread.h',
  'ios/Pods/Headers/Private/RNWorklets/worklets/apple/WorkletsMessageThread.h',
];

let patched = 0;

for (const target of targets) {
  const file = path.resolve(target);
  if (!fs.existsSync(file)) {
    continue;
  }

  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('#elif __has_include(<React_Core/RCTMessageThread.h>)')) {
    continue;
  }

  if (!source.includes(importLine)) {
    throw new Error(`Unable to patch ${target}: expected React RCTMessageThread import not found`);
  }

  fs.writeFileSync(file, source.replace(importLine, replacement));
  patched += 1;
}

if (patched > 0) {
  console.log(`[patch-react-native-worklets] patched ${patched} WorkletsMessageThread header(s)`);
}
