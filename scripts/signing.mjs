import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { stableStringify } from '../src/core/model.js';
import { sha256, verifyReviewBundle } from '../src/core/evidence.js';

// Public-key fingerprints and signatures deliberately cover the canonical manifest,
// whose member hashes cover every evidence payload. No self-trusted embedded key.
export async function signReview(bundle, privateKeyPEM) {
  const checked = await verifyReviewBundle(bundle);
  if (!checked.valid || !checked.planningPass) throw new Error('Refusing to sign invalid evidence or a hard-rule-failing design.');
  const key = createPrivateKey(privateKeyPEM);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 private key is required.');
  const pub = createPublicKey(key).export({type:'spki',format:'der'});
  return {...bundle,signature:{algorithm:'Ed25519',keySHA256:await sha256(pub.toString('base64')),
    value:sign(null,Buffer.from(stableStringify(bundle.manifest)),key).toString('base64')}};
}
export async function verifySignedReview(bundle, trustedPublicKeyPEM, options = {}) {
  const checked = await verifyReviewBundle(bundle,options);
  try {
    const key = createPublicKey(trustedPublicKeyPEM);
    if (key.asymmetricKeyType !== 'ed25519' || bundle.signature?.algorithm !== 'Ed25519') throw new Error('An Ed25519 signature and trusted public key are required.');
    const fingerprint = await sha256(key.export({type:'spki',format:'der'}).toString('base64'));
    const signature = bundle.signature.value;
    if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) throw new Error('Malformed Ed25519 signature.');
    const authenticated = fingerprint === bundle.signature.keySHA256 && verify(null,Buffer.from(stableStringify(bundle.manifest)),key,Buffer.from(signature,'base64'));
    return {...checked,valid:checked.valid&&authenticated,authenticated,planningPass:checked.planningPass&&authenticated,
      routingPass:authenticated?checked.routingPass:false,copperPass:authenticated?checked.copperPass:false,
      errors:authenticated?checked.errors:[...checked.errors,'Signature verification failed for the supplied trusted key.'],
      authenticity:authenticated?'Signature verified with the caller-supplied trusted key; not an independent signoff approval.':'Unauthenticated'};
  } catch(error) {return {...checked,valid:false,authenticated:false,planningPass:false,routingPass:false,copperPass:false,errors:[...checked.errors,error.message]};}
}
