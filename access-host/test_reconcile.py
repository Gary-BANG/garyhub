import copy, importlib.util, json, tempfile, unittest, uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('reconcile',Path(__file__).with_name('reconcile.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class ReconcileTests(unittest.TestCase):
    def test_expiry_revocation_and_preservation(self):
        now=datetime.now(timezone.utc).timestamp()
        def grant(uid,expires,permanent=False,revoked=False):return {'userId':uid,'clientId':str(uuid.uuid4()),'expiresAt':expires,'permanent':permanent,'revoked':revoked}
        db={'version':1,'grants':{'1':grant(1,'2000-01-01T00:00:00Z'),'2':grant(2,None,True),'3':grant(3,None,True,True)}}
        desired=m.desired_clients(db,now);self.assertEqual([c['email'] for c in desired],['garyhub-managed-2'])
        original={'inbounds':[{'tag':'old','port':8080,'settings':{'clients':[{'id':'old'}]}},{'tag':m.TAG,'protocol':'vless','streamSettings':{'network':'ws'},'settings':{'clients':[{'id':'personal','email':'garyhub-migration-test'},{'id':'expired','email':'garyhub-managed-1'}]}}]}
        after=m.merged_config(copy.deepcopy(original),desired)
        self.assertEqual(after['inbounds'][0],original['inbounds'][0]);self.assertEqual(after['inbounds'][1]['settings']['clients'][0]['id'],'personal')
        self.assertNotIn('expired',json.dumps(after))

    def test_real_file_reconcile_and_restart_failure_rollback(self):
        for fail in (False,True):
            with self.subTest(fail=fail),tempfile.TemporaryDirectory() as folder:
                d=Path(folder);x=d/'x.json';runtime=d/'runtime.json';db=d/'db.json';conf=d/'config.json'
                original={'inbounds':[{'tag':m.TAG,'listen':'172.18.0.1','port':18080,'protocol':'vless','streamSettings':{'network':'ws','wsSettings':{'path':'/ws'}},'settings':{'clients':[{'id':'keep','email':'manual'}]}}]}
                old=json.dumps(original).encode();x.write_bytes(old)
                db.write_text(json.dumps({'version':1,'grants':{'1':{'userId':1,'permanent':True,'clientId':str(uuid.uuid4())}}}))
                conf.write_text(json.dumps({'runtime':str(runtime),'lock':str(d/'lock'),'xray_config':str(x),'gateway':'172.18.0.1','entitlements':str(db),'backup':str(d/'backup'),'xray_bin':'xray'}))
                calls=[]
                def execute(cmd):
                    calls.append(cmd)
                    if fail and cmd[:2]==['systemctl','restart'] and sum(c[:2]==['systemctl','restart'] for c in calls)==1:raise RuntimeError('simulated restart failure')
                with patch.object(m,'execute',execute):result=m.main(str(conf))
                if fail:
                    self.assertEqual(result,1);self.assertEqual(x.read_bytes(),old);self.assertFalse(json.loads(runtime.read_text())['ok'])
                else:
                    self.assertEqual(result,0);self.assertTrue(json.loads(runtime.read_text())['ok'])
                    self.assertEqual(len(json.loads(x.read_text())['inbounds'][0]['settings']['clients']),2)
                    db.write_text('broken')
                    with patch.object(m,'execute',execute):self.assertEqual(m.main(str(conf)),1)
                    self.assertEqual(json.loads(x.read_text())['inbounds'][0]['settings']['clients'],[{'id':'keep','email':'manual'}])

if __name__=='__main__':unittest.main()
