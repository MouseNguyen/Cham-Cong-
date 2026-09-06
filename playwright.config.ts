import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"./tests/e2e",testMatch:["auth.spec.ts","kiosk.spec.ts"],fullyParallel:false,workers:1,retries:0,timeout:30000,reporter:"line",outputDir:".tmp/PAY-W2-02/browser-results",use:{baseURL:"http://127.0.0.1:46217",browserName:"chromium",headless:true,trace:"off",screenshot:"off",video:"off"}});
