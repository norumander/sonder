import { useGoogleLogin, type TokenResponse } from "@react-oauth/google";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export function LoginPage() {
  const { token, login, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse: TokenResponse) => {
      setError(null);
      try {
        await login(tokenResponse.access_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    },
    onError: () => setError("Google sign-in failed"),
  });

  // Already authenticated — redirect to home
  if (token) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] bg-brand-dark relative overflow-hidden font-sans pb-20">
      {/* Background glowing orbs */}
      <div className="fixed top-[20%] left-[-10%] w-[40%] h-[40%] bg-brand-teal/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed top-[10%] right-[-10%] w-[40%] h-[40%] bg-brand-purple/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10%] left-[30%] w-[40%] h-[40%] bg-brand-pink/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Fixed Top Navigation Simulator */}
      <div className="fixed top-0 w-full px-6 pt-6 pb-2 z-50 flex justify-center pointer-events-none">
        <nav className="glass-nav px-8 py-4 flex items-center justify-between w-full max-w-7xl mx-auto transition-all duration-300 pointer-events-auto">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 overflow-hidden flex items-center justify-center">
              <img src="/logo.png" alt="Sonder Logo" className="h-full w-full object-contain" />
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">Sonder</span>
          </div>
        </nav>
      </div>
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 w-full max-w-7xl mx-auto z-10 mt-32 mb-24">
        
        {/* Hero Section */}
        <div className="text-center max-w-3xl mb-12">
          <h1 className="text-6xl md:text-7xl font-extrabold mb-4 text-gradient text-glow tracking-tight">Sonder</h1>
          <h2 className="text-2xl md:text-3xl font-semibold text-white mb-4">Elevate Tutoring Performance with AI Analytics.</h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Gain actionable insights, optimize student outcomes, and scale your tutoring services with Sonder's intelligent platform. Sign in with your institution account below.
          </p>
        </div>

        {/* Authentication */}
        <div className="w-full mt-4 flex flex-col items-center">
          {loading ? (
            <div className="flex justify-center mb-6">
              <p className="text-slate-400 animate-pulse text-sm">Signing in...</p>
            </div>
          ) : (
             <button
               onClick={() => googleLogin()}
               disabled={loading}
               className="w-full max-w-[280px] h-12 flex items-center justify-center gap-3 rounded-lg glass-panel hover:bg-white/5 border border-white/10 hover:border-brand-teal transition-all duration-300 text-white font-medium group hover:shadow-[0_0_15px_rgba(45,212,191,0.4)]"
             >
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px">
                 <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                 <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                 <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                 <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                 <path fill="none" d="M0 0h48v48H0z"/>
               </svg>
               Continue with Google
             </button>
          )}

          {error && (
            <p className="mt-6 text-sm text-red-400 bg-red-900/30 py-2 px-3 rounded-md border border-red-500/20 text-center" role="alert">
              {error}
            </p>
          )}

          <p className="text-center text-sm text-slate-500 mt-8 px-4 max-w-xs">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </main>
      
      {/* Why Sonder Features Section */}
      <section className="w-full max-w-5xl mx-auto px-4 z-10">
        <h3 className="text-3xl font-bold text-white text-center mb-12">Why Sonder?</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="glass-panel p-8 border-t-2 border-t-brand-teal bg-brand-dark/50 hover:bg-brand-dark transition-colors">
             <div className="w-12 h-12 rounded-xl bg-brand-teal/20 text-brand-teal flex items-center justify-center mb-6 ring-1 ring-brand-teal/30">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(45,212,191,0.6)]">
                 <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
               </svg>
             </div>
             <h4 className="text-xl font-semibold text-white mb-3">Advanced AI Insights</h4>
             <p className="text-slate-400 leading-relaxed text-sm">
               Real-time extraction of student comprehension, engagement duration, and subtle learning cues that human reviewers often miss.
             </p>
          </div>

          {/* Feature 2 */}
          <div className="glass-panel p-8 border-t-2 border-t-brand-purple bg-brand-dark/50 hover:bg-brand-dark transition-colors">
             <div className="w-12 h-12 rounded-xl bg-brand-purple/20 text-brand-purple flex items-center justify-center mb-6 ring-1 ring-brand-purple/30">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]">
                 <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
               </svg>
             </div>
             <h4 className="text-xl font-semibold text-white mb-3">Real-time Reporting</h4>
             <p className="text-slate-400 leading-relaxed text-sm">
               Instantly review session transcripts, active speaker percentages, and interaction dynamics formatted into actionable post-session dashboards.
             </p>
          </div>

          {/* Feature 3 */}
          <div className="glass-panel p-8 border-t-2 border-t-brand-pink bg-brand-dark/50 hover:bg-brand-dark transition-colors">
             <div className="w-12 h-12 rounded-xl bg-brand-pink/20 text-brand-pink flex items-center justify-center mb-6 ring-1 ring-brand-pink/30">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]">
                 <circle cx="12" cy="12" r="10"/>
                 <circle cx="12" cy="12" r="6"/>
                 <circle cx="12" cy="12" r="2"/>
               </svg>
             </div>
             <h4 className="text-xl font-semibold text-white mb-3">Personalized Coaching</h4>
             <p className="text-slate-400 leading-relaxed text-sm">
               Automated nudges and individualized feedback paths direct tutors on how to customize their pacing and style to meet student needs.
             </p>
          </div>
        </div>
      </section>
      
    </div>
  );
}
