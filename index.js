/**
 * @format
 */

// Minimal polyfill for atob (required by ChunkReader.ts)
import { Buffer } from 'buffer';

if (typeof global.atob === 'undefined') {
    global.atob = str => Buffer.from(str, 'base64').toString('binary');
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
