
import React, { useState } from 'react';
import Button from '../components/Button';
import { useAuth } from '../hooks/useAuth';
import { NavigationProps } from '../types';
import { GoogleIcon } from '../components/IconComponents';

interface AuthPageProps extends NavigationProps {}

const AuthForm: React.FC<{
  isLogin: boolean;
  onSubmit: (e: React.FormEvent) => void;
}> = ({ isLogin, onSubmit }) => (
  <form onSubmit={onSubmit} className="space-y-6">
    <div>
      <label htmlFor="email" className="block text-sm font-medium text-charcoal-grey/90">Email Address</label>
      <input type="email" name="email" id="email" required className="mt-1 block w-full px-3 py-2 bg-warm-cream/50 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-dusty-rose focus:border-dusty-rose" defaultValue="isaac.cronin@example.com" />
    </div>
    {!isLogin && (
       <div>
        <label htmlFor="name" className="block text-sm font-medium text-charcoal-grey/90">Full Name</label>
        <input type="text" name="name" id="name" required className="mt-1 block w-full px-3 py-2 bg-warm-cream/50 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-dusty-rose focus:border-dusty-rose" defaultValue="Isaac Cronin" />
      </div>
    )}
    <div>
      <label htmlFor="password"className="block text-sm font-medium text-charcoal-grey/90">Password</label>
      <input type="password" name="password" id="password" required className="mt-1 block w-full px-3 py-2 bg-warm-cream/50 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-dusty-rose focus:border-dusty-rose" defaultValue="password123" />
    </div>
    <Button type="submit" className="w-full">
      {isLogin ? 'Login' : 'Sign Up'}
    </Button>
  </form>
);

const AuthPage: React.FC<AuthPageProps> = ({ navigate }) => {
  const [isLogin, setIsLogin] = useState(true);
  const { login } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = e.target as typeof e.target & {
        email: { value: string };
        name: { value: string };
    };

    const user = {
      email: target.email.value,
      name: isLogin ? 'Isaac Cronin' : target.name.value,
      subscription: 'Standard' as const, // Default to standard on login/signup for demo
    };
    login(user);
    navigate('profile');
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-2xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-heading font-extrabold text-charcoal-grey">
            {isLogin ? 'Welcome Back!' : 'Create Your Account'}
          </h2>
        </div>
        <div className="flex border-b border-gray-200">
          <button onClick={() => setIsLogin(true)} className={`w-1/2 py-4 text-center font-medium ${isLogin ? 'border-b-2 border-dusty-rose text-dusty-rose' : 'text-gray-500'}`}>
            Login
          </button>
          <button onClick={() => setIsLogin(false)} className={`w-1/2 py-4 text-center font-medium ${!isLogin ? 'border-b-2 border-dusty-rose text-dusty-rose' : 'text-gray-500'}`}>
            Sign Up
          </button>
        </div>

        <AuthForm isLogin={isLogin} onSubmit={handleSubmit} />

        <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
        </div>

        <div>
            <button onClick={() => handleSubmit} className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
                <GoogleIcon className="mr-2" />
                Sign in with Google
            </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
