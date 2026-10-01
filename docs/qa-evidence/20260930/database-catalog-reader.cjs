const {Pool}=require('pg');
const {createRequire}=require('node:module');
const {parse}=createRequire(require.resolve('pg'))('pg-connection-string');
const dns=require('node:dns').promises;
const crypto=require('node:crypto');
const tls=require('node:tls');
const expected={"tables":["_prisma_migrations","account_deletion_requests","admin_audit_logs","auth_identities","auth_sessions","chat_attachments","chat_messages","chat_room_members","chat_rooms","club_members","clubs","comments","consent_records","device_push_tokens","email_verifications","event_member_transitions","event_members","events","friendships","idempotency_records","interests","newsletter_recipients","newsletters","notification_preferences","notifications","outbox_events","phone_verifications","post_attachments","posts","reports","review_attachments","reviews","user_blocks","user_interests","users"],"migrations":[{"name":"20260729210000_init","checksum":"ac25fbb60b2f91c24adcdee935d5d2231a1f6438bf495fff0cdd3710f508d705"},{"name":"20260730152000_outbox_lease_index","checksum":"f1a8065e79089124e62e39e1470a83ec1782e1f18cda783a7f629c4fc1dc3d0b"},{"name":"20260730170000_club_public_catalog_index","checksum":"4f8c7b10e5c93710f8d77cbbefbc364a8e6c681621eb5078789c459dca672258"},{"name":"20260730193000_notification_feed_index","checksum":"b8deab7194694eacd6b8335d128a786b9d2fc100eca66de20337a462e9b55ba2"},{"name":"20260730200000_post_comment_feed_indexes","checksum":"371f93771e5feaf809198e48258080b729f9f1b8f5db9f78966a999575618438"},{"name":"20260730204500_review_feed_index","checksum":"ee96e6072d5cdbeadac555d7f131e1baa775e145acec4a45af09485c65d36e38"},{"name":"20260730210000_event_draft_management_index","checksum":"9ae507457476342749bd8ba01dd016a9b4dd4f60c22f14ae2fcf6e220dc11556"},{"name":"20260730210000_report_feed_index","checksum":"423408e77c8bdcbfb0250edb1114fb2a3ea288a4d2e6bd10945a19bdea13113c"},{"name":"20260730213000_chat_room_activity_index","checksum":"41ba7b1b18aaae5888b5b12de6bf46f0acaed910217f6be7d635281fe5d1a9ff"},{"name":"20260806120000_phone_sms_auth","checksum":"36fa9ddab913be83cb3584a5b7a68f7d63cd85f2675dbb4d50ead85fae5b2fe7"}]};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
(async()=>{
  const configuration=parse(process.env.DATABASE_URL);
  if(configuration.sslmode!=='verify-full' || !configuration.ssl?.ca || configuration.ssl.rejectUnauthorized===false || process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Object.assign(new Error(),{code:'UNSAFE_TLS_CONFIGURATION'});
  const replacement=process.env.SENIOR_RECOVERY_HOST;
  if(replacement && (replacement===configuration.host || !/^[a-z0-9.-]+\.rds\.amazonaws\.com$/.test(replacement)))throw Object.assign(new Error(),{code:'INVALID_RECOVERY_TARGET'});
  const host=replacement||configuration.host;
  const resolved=await dns.lookup(host,{all:true,family:4});
  if(!resolved.length || !resolved.every(x=>/^172\.31\./.test(x.address)))throw Object.assign(new Error(),{code:'TARGET_OUTSIDE_VPC'});
  const pool=new Pool({...configuration,host,ssl:{...configuration.ssl,rejectUnauthorized:true,servername:host},max:1,connectionTimeoutMillis:8000,options:'-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000'});
  let client;
  let proof;
  try{
    client=await pool.connect();
    const stream=client.connection.stream;
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity=(await client.query("SELECT current_database() AS db, current_setting('server_version') AS version, current_setting('transaction_read_only') AS read_only")).rows[0];
    const rows=(await client.query('SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY migration_name')).rows;
    const migrationsMatch=rows.length===expected.migrations.length && rows.every((r,i)=>r.migration_name===expected.migrations[i].name && r.checksum===expected.migrations[i].checksum && r.finished && !r.rolled_back);
    const tables=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r=>r.table_name);
    const tablesMatch=JSON.stringify(tables)===JSON.stringify(expected.tables);
    const metadata={};
    const queries={
      columns:"SELECT table_name,column_name,ordinal_position,is_nullable,data_type,udt_schema,udt_name,column_default,character_maximum_length,numeric_precision,numeric_scale,is_identity,is_generated,generation_expression FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
      enums:"SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder",
      constraints:"SELECT c.relname,p.conname,p.contype,p.convalidated,p.condeferrable,p.condeferred,pg_get_constraintdef(p.oid,true) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,p.conname",
      indexes:"SELECT t.relname AS table_name,c.relname AS index_name,i.indisvalid,i.indisready,i.indisunique,i.indisprimary,pg_get_indexdef(i.indexrelid,0,true) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.relname",
      sequences:"SELECT sequencename,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename",
      views:"SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY viewname",
      triggers:"SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
      functions:"SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname,args",
      extensions:"SELECT extname,extversion FROM pg_extension ORDER BY extname",
    };
    for(const [name,sql]of Object.entries(queries))metadata[name]=(await client.query(sql)).rows;
    const invalidConstraints=metadata.constraints.filter(r=>!r.convalidated).length;
    const invalidIndexes=metadata.indexes.filter(r=>!r.indisvalid||!r.indisready).length;
    proof={event:'senior-recovery-schema-proof',mode:replacement?'restored':'baseline',authorized:stream.authorized===true,hostnameValidated:tls.checkServerIdentity(host,stream.getPeerCertificate())===undefined,privateSocket:/^172\.31\./.test(stream.remoteAddress||''),tlsProtocol:stream.getProtocol(),readOnly:identity.read_only==='on',databaseIdentityMatches:identity.db===configuration.database,serverVersion:identity.version,migrationCount:rows.length,migrationsMatch,tableCount:tables.length,tablesMatch,invalidConstraints,invalidIndexes,migrationFingerprint:digest(rows),catalogFingerprint:digest(metadata),catalogCounts:Object.fromEntries(Object.entries(metadata).map(([k,v])=>[k,v.length]))};
    proof.passed=proof.authorized&&proof.hostnameValidated&&proof.privateSocket&&proof.readOnly&&proof.databaseIdentityMatches&&proof.migrationsMatch&&proof.tablesMatch&&!invalidConstraints&&!invalidIndexes;
    await client.query('ROLLBACK');
  }finally{
    if(client){await client.query('ROLLBACK').catch(()=>{});client.release();}
    await pool.end();
  }
  console.log(JSON.stringify(proof));
  process.exitCode=proof.passed?0:1;
})().catch(error=>{
  console.log(JSON.stringify({event:'senior-recovery-schema-proof',passed:false,errorCode:/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'UNKNOWN'}));
  process.exitCode=1;
});
