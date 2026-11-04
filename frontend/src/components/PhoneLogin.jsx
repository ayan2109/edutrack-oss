import React, { useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';
import { ShieldCheck, Phone, ArrowRight, GraduationCap, LoaderCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function PhoneLogin({ onAuthenticated }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [institution, setInstitution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const sendOtp = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    const digits = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) { setError('Enter a valid 10-digit Indian mobile number.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API}/auth/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: `+91${digits}` })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to generate OTP.');
      setOtpSent(true);
      setNotice(data.deliveryChannel === 'console'
        ? 'Development OTP generated. Check the EduTrack backend terminal for the 6-digit code.'
        : `OTP sent to your mobile number via ${data.provider || 'SMS provider'}. It expires in 5 minutes.`);
    } catch (err) { setError(err.message || 'Unable to generate OTP.'); }
    finally { setBusy(false); }
  };

  const verifyOtp = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    if (!/^\d{6}$/.test(otp.trim())) { setError('Enter the 6-digit OTP.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API}/auth/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: `+91${phone}`, otp: otp.trim(), institutionName: institution.trim() || 'My Institution' })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'OTP verification failed.');
      await signInWithCustomToken(auth, data.customToken);
      await auth.currentUser.getIdToken(true);
      onAuthenticated?.(data.user);
    } catch (err) { setError(err.message || 'OTP verification failed.'); }
    finally { setBusy(false); }
  };

  return <div className="auth-screen"><div className="auth-card">
    <div className="auth-brand"><div className="brand-mark"><GraduationCap size={23}/></div><div><b>EduTrack<span>OSS</span></b><small>Academic workspace</small></div></div>
    <div className="auth-icon"><ShieldCheck size={25}/></div><span className="eyebrow">PHONE OTP SIGN IN</span>
    <h1>{otpSent ? 'Verify your number' : 'Welcome to EduTrack'}</h1>
    <p>{otpSent ? `Enter the 6-digit code sent to +91 ${phone}.` : 'Sign in or create your institution account using your mobile number.'}</p>
    {!otpSent ? <form onSubmit={sendOtp} className="auth-form">
      <label>Mobile number</label><div className="phone-input"><span>🇮🇳 +91</span><input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="10-digit mobile number" inputMode="numeric" autoComplete="tel-national" required/></div>
      <label>Institution name <small>(for first-time setup)</small></label><input value={institution} onChange={e=>setInstitution(e.target.value)} placeholder="Your school / college / institute"/>
      <button className="btn btn-primary auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<Phone size={17}/>} Generate OTP <ArrowRight size={16}/></button>
    </form> : <form onSubmit={verifyOtp} className="auth-form">
      <label>6-digit verification code</label><input className="otp-input" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="••••••" inputMode="numeric" autoComplete="one-time-code" required/>
      <button className="btn btn-primary auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<ShieldCheck size={17}/>} Verify & continue</button>
      <button type="button" className="auth-back" onClick={()=>{setOtpSent(false);setOtp('');setError('');setNotice('');}}>Change phone number</button>
    </form>}
    {notice&&<div className="auth-notice">{notice}</div>}{error&&<div className="auth-error">{error}</div>}
    <div className="auth-foot">OTP delivery is configured by the server administrator. Development mode prints the code in the backend terminal; production mode uses the configured SMS provider.</div>
  </div></div>;
}
