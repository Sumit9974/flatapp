// Background tasks are defined at module load: Android can wake the app for a geofence enter/exit
// or the presence check-in with no screen mounted, so each task must exist before anything renders.
import './src/geofence/task';
import './src/presence/task';
import './src/presence/checkin';
import { registerRootComponent } from 'expo';
import App from './App';
import { configureNotifications } from './src/notify';

configureNotifications();
registerRootComponent(App);
