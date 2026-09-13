import { MYPOS_TEST, getTxnStatus } from '../../src/lib/mypos/ipc';
getTxnStatus(MYPOS_TEST, process.argv[2]!).then((r) => { const { ruw: _r, ...rest } = r; console.log(rest); });
