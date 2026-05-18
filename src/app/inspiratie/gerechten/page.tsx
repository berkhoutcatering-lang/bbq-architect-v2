import { redirect } from 'next/navigation';

/* /inspiratie/gerechten is gedeprecateerd: /gerechten is de canonical hub-page. */
export default function InspiratieGerechtenRedirect() {
    redirect('/gerechten');
}
