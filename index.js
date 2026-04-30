require('dotenv').config();

const { runPipeline } = require('./pipeline');

function parseArgs(argv) {
  const args = { send: false, limit: 10, daysBack: 30 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--send') args.send = true;
    else if (a === '--limit' && argv[i + 1]) args.limit = Number(argv[++i]);
    else if (a === '--days' && argv[i + 1]) args.daysBack = Number(argv[++i]);
  }
  return args;
}

async function main() {
  const { send, limit, daysBack } = parseArgs(process.argv);

  console.error(`Fetching up to ${limit} permits (issued in last ${daysBack} days)…`);

  const results = await runPipeline({ limit, days: daysBack, send });

  console.error(
    `Pipeline finished: ${results.filter((r) => r.postcardStatus !== 'Failed').length}/${results.length} non-failed.`,
  );

  const preview = results.slice(0, 5).map((r) => ({
    permitnum: r.permitnum,
    contractorname: r.contractorname,
    originaladdress: r.address,
    copy: r.copy,
    postcardStatus: r.postcardStatus,
  }));
  if (preview.length) {
    console.log(JSON.stringify(preview, null, 2));
    if (results.length > 5) console.error('(showing first 5 on stdout)');
  } else {
    console.log('[]');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
