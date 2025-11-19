
import React from 'react';
import Button from '../components/Button';
import { useAuth } from '../hooks/useAuth';
import { NavigationProps } from '../types';
import UploadedImagesGallery from '../components/UploadedImagesGallery';

const DownloadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
const DeleteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const RegenerateIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 4l1.5 1.5A9 9 0 0120 12h-3a6 6 0 00-9.66-4.99L4 4zM20 20l-1.5-1.5A9 9 0 014 12h3a6 6 0 009.66 4.99L20 20z" /></svg>;

interface ProfilePageProps extends NavigationProps {}

const ProfilePage: React.FC<ProfilePageProps> = ({ navigate }) => {
  const { user, history, logout, deleteHistoryItem, setRegenerate, uploadedPersonImages, uploadedOutfitImages } = useAuth();

  if (!user) {
    return (
      <div className="container mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl">You are not logged in.</h1>
        <Button onClick={() => navigate('auth')} className="mt-4">Login</Button>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate('home');
  }

  const handleRegenerate = (personImg: string, outfitImg: string) => {
    setRegenerate(personImg, outfitImg);
    navigate('dress-yourself');
  };

  return (
    <div className="container mx-auto px-6 py-16">
      <div className="mb-12">
        <h1 className="text-4xl font-heading font-bold">Welcome, {user.name}</h1>
        <p className="text-charcoal-grey/70">{user.email}</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-12">
        {/* Subscription Info */}
        <div className="lg:col-span-1 bg-white p-8 rounded-lg shadow-lg h-fit">
          <h2 className="text-2xl font-heading font-semibold mb-4">My Subscription</h2>
          <div className="bg-soft-blush/50 p-4 rounded-md text-center mb-4">
            <p className="text-sm">Current Plan</p>
            <p className="text-2xl font-bold text-dusty-rose">{user.subscription}</p>
          </div>
          <Button onClick={() => navigate('pricing')} variant="secondary" className="w-full text-base py-2">
            Change Plan
          </Button>
           <button onClick={handleLogout} className="w-full text-center text-gray-500 mt-4 hover:text-dusty-rose">
            Logout
          </button>
        </div>

        {/* Try-On History */}
        <div className="lg:col-span-2">
          <h2 className="text-3xl font-heading font-semibold mb-6">My Try-On History</h2>
          {history.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-8">
              {history.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-lg shadow-lg flex flex-col">
                  <img src={item.resultImg} alt="Generated try-on" className="w-full h-auto object-cover rounded-md mb-4" />
                  <div className="flex justify-center space-x-2">
                    <img src={item.personImg} alt="Person" className="w-16 h-16 object-contain rounded-md border-2 border-soft-blush bg-gray-100" />
                    <img src={item.outfitImg} alt="Outfit" className="w-16 h-16 object-contain rounded-md border-2 border-soft-blush bg-gray-100" />
                  </div>
                   <p className="text-xs text-center text-gray-400 mt-2 mb-4">{item.createdAt.toLocaleDateString()}</p>
                   <div className="mt-auto grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                      <a href={item.resultImg} download={`try-on-${new Date(item.createdAt).getTime()}.png`} className="flex items-center justify-center gap-1 text-sm text-center py-2 px-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
                        <DownloadIcon /> Download
                      </a>
                      <button onClick={() => handleRegenerate(item.personImg, item.outfitImg)} className="flex items-center justify-center gap-1 text-sm text-center py-2 px-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
                        <RegenerateIcon /> Re-do
                      </button>
                      <button onClick={() => deleteHistoryItem(item.id)} className="flex items-center justify-center gap-1 text-sm text-red-500 text-center py-2 px-2 bg-red-50 hover:bg-red-100 rounded-md transition-colors">
                        <DeleteIcon /> Delete
                      </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center bg-white p-12 rounded-lg shadow-lg">
              <p className="text-lg text-charcoal-grey/70 mb-4">You haven't generated any try-ons yet.</p>
              <Button onClick={() => navigate('dress-yourself')}>
                Start Dressing Yourself
              </Button>
            </div>
          )}
        </div>
         {/* Saved Uploads Section */}
        <div className="lg:col-span-3 mt-8">
            <UploadedImagesGallery title="My Uploaded Photos" images={uploadedPersonImages} />
        </div>
        <div className="lg:col-span-3 mt-8">
            <UploadedImagesGallery title="My Uploaded Outfits" images={uploadedOutfitImages} />
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
