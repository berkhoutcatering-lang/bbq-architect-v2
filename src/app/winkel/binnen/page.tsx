import { redirect } from 'next/navigation';

/** Binnen zit nu in Leveringen. Oude links blijven werken. */
export default function BinnenPage() {
    redirect('/winkel/leveringen?binnen=1');
}
