// Run the unchanged queue regression bodies against this wave's exact owned DB.
import {vi} from 'vitest';
import {releasePool} from './release-support';
vi.mock('./support',async()=>{const actual=await vi.importActual<typeof import('./support')>('./support');return {...actual,appPool:releasePool};});
import './outbox.spec';
import './leases.spec';
import './retry.spec';
