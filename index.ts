// Both background geofence tasks are defined at module load: Android can wake the app for an
// enter/exit event with no screen mounted, so each task must exist before anything renders.
import './src/geofence/task';
import './src/presence/task';
import { registerRootComponent } from 'expo';
import App from './App';
import { configureNotifications } from './src/notify';

configureNotifications();
registerRootComponent(App);
