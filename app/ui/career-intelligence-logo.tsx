import Image from 'next/image';

export default function CareerIntelligenceLogo() {
  return (
    <Image
      src="/career-intelligence-logo.png"
      alt="Career Intelligence"
      width={240}
      height={80}
      priority
      className="h-auto w-full"
    />
  );
}
