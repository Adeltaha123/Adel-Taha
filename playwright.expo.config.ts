import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/expo',timeout:60000,expect:{ timeout:10000 },workers:1,
  use:{ baseURL:'http://127.0.0.1:5188',browserName:'chromium',viewport:{ width:390,height:844 },screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{ args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] } },
  webServer:[
    { command:'node scripts/serve-expo-test.mjs',url:'http://127.0.0.1:5188',reuseExistingServer:false },
    { command:'node --import tsx server/index.ts',url:'http://127.0.0.1:3012/api/health',reuseExistingServer:false,env:{ API_PORT:'3012',API_DB:`test-results/expo-${Date.now()}.sqlite`,API_ORIGINS:'http://127.0.0.1:5188' } },
  ],
});
