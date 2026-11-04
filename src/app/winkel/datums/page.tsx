import { redirect } from 'next/navigation';

/** Datums zit nu in Leveringen. Oude meldingen blijven werken. */
export default function DatumsPage() {
    redirect('/winkel/leveringen');
}
