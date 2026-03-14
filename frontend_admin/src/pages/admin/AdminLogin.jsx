import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Lock, Mail, ArrowRight, BusFront } from 'lucide-react';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        // For simplicity: hardcoded admin check or supabase check.
        // The instructions don't specify custom auth vs supabase auth.
        // Assuming supabase query on "admins" table.

        // Example bypass for local setup using env variables
        const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'admin@mpnmj.edu';
        const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'admin@mpnmj.edu';

        if (email === adminEmail && password === adminPassword) {
            localStorage.setItem('admin', 'true');
            navigate('/admin/dashboard');
            return;
        }

        const { data, error } = await supabase
            .from('admins')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !data) {
            alert("Invalid Admin Credentials");
            return;
        }

        localStorage.setItem('admin', 'true');
        navigate('/admin/dashboard');
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
            <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl relative overflow-hidden ring-1 ring-slate-200">
                <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-yellow-400 to-yellow-600"></div>
                <div className="text-center mb-10 pt-4">
                    <div className="bg-slate-50 p-4 rounded-full mx-auto w-20 h-20 flex items-center justify-center mb-6 shadow-sm border border-slate-100">
                        <Lock className="text-yellow-600 w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-yellow-600 tracking-tight">Admin Gateway</h2>
                    <p className="text-slate-500 mt-2 font-medium">Authentication required</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                            <Mail size={20} />
                        </div>
                        <input
                            type="email"
                            placeholder="Admin Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500 bg-slate-50 text-slate-900 font-medium transition-all outline-none"
                            required
                        />
                    </div>

                    <div className="relative mt-4">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                            <Lock size={20} />
                        </div>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500 bg-slate-50 text-slate-900 font-medium transition-all outline-none"
                            required
                        />
                    </div>

                    <button className="relative w-full overflow-hidden rounded-xl h-14 group transition-transform active:scale-95 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold text-lg flex items-center justify-center gap-2">
                        Secure Login
                        <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
                    </button>
                </form>
                
                <div className="mt-8 text-center pt-6 border-t border-slate-100">
                    <button 
                        onClick={() => navigate('/driver/login')}
                        className="text-slate-500 hover:text-yellow-600 text-sm font-semibold transition-colors flex items-center justify-center gap-2 mx-auto"
                    >
                        <BusFront size={16} />
                        Driver Portal Access
                    </button>
                </div>
            </div>
        </div>
    );
}
