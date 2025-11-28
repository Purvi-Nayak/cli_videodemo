/**
 * @format
 */

// Polyfills for random + Buffer + atob/btoa
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
    global.Buffer = Buffer;
}

if (typeof global.atob === 'undefined') {
    global.atob = str => Buffer.from(str, 'base64').toString('binary');
}
if (typeof global.btoa === 'undefined') {
    global.btoa = str => Buffer.from(str, 'binary').toString('base64');
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
