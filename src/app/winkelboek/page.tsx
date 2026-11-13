export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Boekhouding winkel · Overzicht',
    description: 'De laatste dag in hokjes en of kas en pin kloppen.',
};

export default function WinkelboekPagina() {
    return (
        <>
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Boekhouding winkel</h1>
                    <div className="wk-onder">Sluit de kassa af en alles staat vanzelf in het juiste hokje: omzet, btw, kas, pin en voorraad.</div>
                </div>
            </div>
            <div className="kf-empty">
                <p>Nog geen afgesloten dagen. Zodra je de kassa afsluit, staat de dag hier.</p>
            </div>
        </>
    );
}
