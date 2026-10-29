import {defineConfig} from 'vite';
export default defineConfig({server:{proxy:{
  '/runtime-config.json':{target:process.env.NEURO_GATEWAY_URL??'http://127.0.0.1:8080'},
  '/nodes/':{target:process.env.NEURO_GATEWAY_URL??'http://127.0.0.1:8080',ws:true},
}}});
