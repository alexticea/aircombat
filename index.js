// react-native-quick-crypto removed for Expo Go compatibility
// import { install } from 'react-native-quick-crypto';
// install(); 

import 'react-native-get-random-values';
import { Buffer } from '@craftzdog/react-native-buffer';
global.Buffer = Buffer;
global.TextEncoder = require('text-encoding').TextEncoder;
global.process = require('process');

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
