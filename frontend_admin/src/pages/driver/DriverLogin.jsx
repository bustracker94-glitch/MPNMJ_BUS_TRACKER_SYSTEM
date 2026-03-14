import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Lock, Phone, ArrowRight } from 'lucide-react';

export default function DriverLogin() {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('phone', phone)
            .eq('password', password)
            .single();

        if (error || !data) {
            alert("Invalid Phone number or Password");
            return;
        }

        // In a real app we might set auth token, for simplicity we store in localStorage
        localStorage.setItem('driver', JSON.stringify(data));
        navigate('/driver/panel');
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
            <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl relative overflow-hidden ring-1 ring-gray-100">
                <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-yellow-400 to-yellow-600"></div>
                <div className="text-center mb-10 pt-4">
                    <div className="bg-yellow-100 p-4 rounded-full mx-auto w-20 h-20 flex items-center justify-center mb-6 shadow-sm border border-yellow-200">
                        <Lock className="text-yellow-600 w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Driver Portal</h2>
                    <p className="text-gray-500 mt-2 font-medium">Please login with your credentials</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                            <Phone size={20} />
                        </div>
                        <input
                            type="tel"
                            placeholder="Your Phone Number"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 focus:ring-4 focus:ring-yellow-50 focus:border-yellow-500 bg-gray-50 text-gray-900 font-medium transition-all"
                            required
                        />
                    </div>

                    <div className="relative mt-4">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                            <Lock size={20} />
                        </div>
                        <input
                            type="password"
                            placeholder="Your Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 focus:ring-4 focus:ring-yellow-50 focus:border-yellow-500 bg-gray-50 text-gray-900 font-medium transition-all"
                            required
                        />
                    </div>

                    <button className="relative w-full overflow-hidden rounded-xl h-14 group">
                        <span className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-yellow-600"></span>
                        <span className="relative flex items-center justify-center text-white font-bold text-lg h-full px-6 transition-all duration-300 group-hover:gap-3 gap-2">
                            Access Dashboard
                            <ArrowRight size={20} />
                        </span>
                    </button>
                </form>
            </div>
        </div>
    );
}
