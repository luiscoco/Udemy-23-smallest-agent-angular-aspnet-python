import {bootstrapApplication} from '@angular/platform-browser';
import {App} from './app/app';
bootstrapApplication(App).catch(()=>console.error('The application could not start.'));
