
import React from 'react';

interface TestimonialCardProps {
  quote: string;
  author: string;
  avatarUrl: string;
}

const TestimonialCard: React.FC<TestimonialCardProps> = ({ quote, author, avatarUrl }) => {
  return (
    <div className="bg-white p-8 rounded-lg shadow-lg text-center">
      <img src={avatarUrl} alt={author} className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-soft-blush" />
      <p className="font-accent italic text-xl text-charcoal-grey/90 mb-4">"{quote}"</p>
      <p className="font-semibold text-dusty-rose">- {author}</p>
    </div>
  );
};

export default TestimonialCard;
