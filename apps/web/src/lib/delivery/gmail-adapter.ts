import {createHash,randomUUID} from 'node:crypto';
import type {FakeMessage} from './types';
import {assertSyntheticMessage} from './fake-adapter';
/** MIME contract only. OAuth/network activation is deliberately absent. */
export function payslipMime(message:FakeMessage,pdf:Buffer):Buffer{
 assertSyntheticMessage(message);
 if(!message.attachment||pdf.length!==message.attachment.bytes||createHash('sha256').update(pdf).digest('hex')!==message.attachment.sha256)throw Error('ATTACHMENT_MISMATCH');
 const boundary='pay-slip-'+randomUUID(),b64=pdf.toString('base64').match(/.{1,76}/g)!.join('\r\n');
 return Buffer.from([`To: ${message.to}`,`Subject: ${message.subject}`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(message.body).toString('base64'),`--${boundary}`,'Content-Type: application/pdf',`Content-Disposition: attachment; filename="${message.attachment.artifactId}.pdf"`,'Content-Transfer-Encoding: base64','',b64,`--${boundary}--`,''].join('\r\n'));
}
export function createGmailAdapter(){return {enabled:false as const,scope:'https://www.googleapis.com/auth/gmail.send',async send():Promise<never>{throw Error('GMAIL_DISABLED');}};}
