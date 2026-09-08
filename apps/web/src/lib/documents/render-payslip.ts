import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { payslipHtml } from '../../templates/payslip.vi';
import type { PayslipViewModel } from '../../../../../packages/document-domain/src/payslip-view-model';
export async function renderPayslip(view:PayslipViewModel,options:{projectRoot:string;chromiumPath:string}):Promise<Buffer> {
  const base=join(options.projectRoot,'apps/web/src');
  const [regular,bold,style]=await Promise.all([readFile(join(base,'templates/fonts/BeVietnamPro-Regular.ttf')),readFile(join(base,'templates/fonts/BeVietnamPro-Bold.ttf')),readFile(join(base,'styles/payslip.css'),'utf8')]);
  const css=`@font-face{font-family:'Be Vietnam Pro';font-weight:400;src:url(data:font/ttf;base64,${regular.toString('base64')})} @font-face{font-family:'Be Vietnam Pro';font-weight:700;src:url(data:font/ttf;base64,${bold.toString('base64')})}\n${style}`;
  const browser=await chromium.launch({executablePath:options.chromiumPath,headless:true,timeout:15000,args:['--disable-background-networking']});
  const deadline=setTimeout(()=>{void browser.close().catch(()=>undefined);},30000);
  try {
    const context=await browser.newContext({offline:true,serviceWorkers:'block'});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    await page.setContent(payslipHtml(view,css),{waitUntil:'load',timeout:15000});
    await page.evaluate(()=>document.fonts.ready);
    return await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});
  } finally {clearTimeout(deadline);await browser.close();}
}
