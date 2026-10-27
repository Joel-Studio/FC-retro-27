/*
 * looks_desc.js  -  appearance from JODIO's "who looks like what" list (v29).
 * One line per player:  name | height cm | skin | hair colour | hair style | beard | build
 *   skin   P pale, F fair, L light, T tan, O olive, M brown, D dark brown, X very dark
 *   hair   K black, N dark brown, B brown, L light brown, D dark blond, G blond, P platinum, R reddish-blond, S sandy, Y graying
 *   style  short fade curly buzz long bun dreads slick bald   (- keeps the style already drawn for him)
 *   beard  0 clean, 1 stubble / short beard, 2 full beard, - keep what is there
 *   build  s slight, n normal, w broad / heavy
 * Merged over RUT.REAL (skin, hair, style, beard, build) when pixelart.lookFor draws him, and the height goes onto his card.
 */
window.RUT = window.RUT || {};
(function () {
  const SKIN = { P: '#f2d1bd', F: '#ebbd9c', L: '#dfae88', T: '#c98f63', O: '#b98255', M: '#94613e', D: '#6c432a', X: '#48291b' };
  const HAIR = { K: '#14100e', N: '#2b1e16', B: '#4b3424', L: '#7b5b3d', D: '#a98b56', G: '#d4b66c', P: '#e8dcae', R: '#b07b4b', S: '#bb9d66', Y: '#767069' };
  const BUILD = { s: 0.9, n: 1, w: 1.1 };
  const T = `
Erling Haaland|195|P|P|short|0|w
Kylian Mbappé|178|M|K|fade|0|s
Harry Kane|188|F|B|short|1|w
Lamine Yamal|180|O|K|curly|0|s
Mohamed Salah|175|O|K|curly|2|w
Ousmane Dembélé|178|D|K|fade|0|s
Rodri|191|O|B|short|1|w
Vinícius Jr.|176|D|K|-|0|s
Achraf Hakimi|181|M|K|fade|1|n
Alisson|191|L|N|short|-|w
Bukayo Saka|178|M|K|curly|1|n
Florian Wirtz|176|P|D|short|0|s
Gianluigi Donnarumma|196|O|N|slick|-|w
Jude Bellingham|186|L|K|fade|-|w
Lautaro Martínez|174|T|N|short|1|w
Pedri|174|O|N|short|0|s
Raphinha|176|T|N|fade|2|s
Thibaut Courtois|199|F|L|short|-|s
Virgil van Dijk|193|T|K|bun|-|w
Vitinha|172|F|B|short|0|s
Alexander Isak|192|L|N|short|1|s
Cole Palmer|189|P|N|short|0|s
Declan Rice|185|F|N|fade|0|w
Federico Valverde|182|T|N|short|1|w
Jamal Musiala|184|T|K|curly|0|s
Joshua Kimmich|177|F|D|short|0|n
Julián Álvarez|170|T|N|short|0|n
Khvicha Kvaratskhelia|183|O|N|curly|-|n
Martin Ødegaard|178|F|D|slick|0|s
Michael Olise|183|T|K|curly|0|s
William Saliba|192|D|K|buzz|0|s
Alessandro Bastoni|190|F|N|short|1|n
Alexis Mac Allister|176|L|N|short|1|n
Bruno Fernandes|178|F|N|short|1|s
Gabriel Magalhães|190|T|K|short|-|w
Gregor Kobel|194|F|B|short|0|n
Jan Oblak|188|F|N|short|0|w
Kevin De Bruyne|181|P|R|short|1|n
Marquinhos|183|M|K|short|1|n
Mike Maignan|191|D|K|fade|0|n
Moisés Caicedo|178|D|K|curly|0|w
Nicolò Barella|172|F|L|short|1|s
Nuno Mendes|183|D|K|fade|0|s
Robert Lewandowski|185|F|D|short|1|s
Lionel Messi|170|F|N|short|2|s
Cristiano Ronaldo|187|T|K|slick|0|w
Rúben Dias|187|T|N|short|1|w
Antonio Rüdiger|190|M|K|short|-|w
Bruno Guimarães|180|T|N|short|1|n
Désiré Doué|181|M|K|curly|0|n
Emiliano Martínez|195|T|N|short|1|w
Frenkie de Jong|180|F|L|short|0|s
Hakan Çalhanoğlu|178|F|K|slick|1|s
Josko Gvardiol|185|F|N|short|1|w
Jules Koundé|178|M|K|short|1|w
Luis Díaz|178|M|K|curly|0|s
Manuel Neuer|193|F|S|short|0|w
Nico Williams|181|D|K|short|0|n
Rafael Leão|188|M|K|-|0|s
Ryan Gravenberch|190|M|K|short|0|s
Scott McTominay|193|F|B|short|1|w
Viktor Gyökeres|189|F|G|short|0|w
Antoine Griezmann|176|P|B|short|1|s
Aurélien Tchouaméni|185|M|K|fade|0|n
Dani Olmo|179|F|B|short|1|s
Dayot Upamecano|186|D|K|short|0|w
Éder Militão|185|M|K|fade|0|n
Enzo Fernández|178|T|N|short|1|n
Fabián Ruiz|189|F|B|short|0|s
Federico Dimarco|177|F|N|short|1|s
Gleison Bremer|188|D|K|short|1|w
Joan García|187|F|B|short|0|n
Jonathan Tah|195|M|K|short|0|w
Lucas Chevalier|187|F|L|short|0|n
Luka Modrić|172|F|D|-|0|s
Marcus Thuram|192|M|G|short|2|w
Nico Schlotterbeck|191|F|B|short|1|n
Omar Marmoush|183|T|K|short|1|s
Sandro Tonali|181|F|N|slick|1|s
Tijjani Reijnders|183|F|D|short|0|s
Willian Pacho|184|M|K|short|0|n
Adrien Rabiot|188|F|N|short|1|s
Aleix García|178|F|N|short|1|s
Alessandro Buongiorno|190|F|N|short|0|n
Alex Baena|178|T|N|short|0|s
Alphonso Davies|183|M|K|short|0|n
Charles De Ketelaere|191|F|L|short|0|s
Dušan Vlahović|190|F|D|short|1|n
João Pedro|183|L|K|short|1|n
Mason Greenwood|181|F|N|short|0|s
Unai Simón|180|F|N|short|0|w
Xavi Simons|173|T|K|short|0|s
Exequiel Palacios|171|F|N|short|1|s
Geronimo Rulli|187|F|G|short|0|n
Julian Brandt|188|P|B|short|0|s
Koke|178|F|N|short|2|w
Brice Samba|186|D|K|short|0|w
Christoph Baumgartner|180|F|B|short|0|s
Aleksandr Golovin|178|F|G|short|0|s
James Maddison|178|F|L|short|1|s
Kingsley Coman|181|D|K|short|0|s
Lucas Paquetá|180|L|N|short|2|n
Nico Paz|179|F|N|short|0|s
Oliver Baumann|188|F|B|short|0|w
Thomas Partey|185|D|K|short|0|w
Wladimiro Falcone|191|F|N|short|0|n
Bryan Mbeumo|175|M|K|short|0|n
Douglas Luiz|178|L|K|short|1|n
Eric García|182|F|B|short|0|s
Gabriel Martinelli|180|L|N|short|0|n
Ibrahima Konaté|190|D|K|short|0|w
Jeremie Frimpong|171|D|G|short|0|s
Manuel Akanji|187|M|K|short|0|n
Marcos Llorente|184|F|D|short|0|w
Matthias Ginter|190|F|G|short|0|w
Nahuel Molina|179|T|N|short|1|s
Nicolas Jackson|178|D|K|short|0|s
Takefusa Kubo|173|F|K|short|0|s
Álex Remiro|189|F|B|short|0|n
Dominic Solanke|190|M|K|short|0|s
Harvey Elliott|172|F|L|curly|0|s
Hirving Lozano|175|T|N|short|0|n
Jean-Clair Todibo|190|D|K|short|0|n
Kieran Trippier|173|F|D|short|1|n
Morgan Gibbs-White|178|F|N|short|0|n
Naby Keïta|168|D|K|short|0|s
Oihan Sancet|188|F|N|short|0|n
Pau Torres|191|F|N|short|0|s
Pierre-Emerick Aubameyang|187|D|K|-|0|s
Ricardo Horta|173|F|B|short|1|s
Robin Le Normand|186|F|B|short|1|n
Samuel Chukwueze|172|D|K|short|0|s
Serhou Guirassy|189|D|K|short|1|w
Stefan de Vrij|189|F|B|short|0|n
Teun Koopmeiners|185|F|L|short|0|n
Yassine Bounou|192|T|N|short|1|n
Youri Tielemans|176|F|D|short|0|n
Alex Iwobi|185|D|K|short|0|s
Andreas Pereira|177|L|G|short|1|s
Arthur Theate|184|F|B|short|0|n
Conor Bradley|178|F|B|short|0|s
Éderson|179|T|K|short|0|n
Emile Smith Rowe|180|P|L|short|0|s
Evan Ndicka|191|D|K|short|0|w
Galeno|180|L|K|short|0|n
Harvey Barnes|180|F|D|short|0|n
Ismaël Koné|186|D|K|short|0|n
Jacob Murphy|178|F|B|short|0|n
João Neves|174|F|B|short|0|s
Josip Stanišić|186|F|N|short|0|s
Kobbie Mainoo|175|M|K|curly|0|n
Lucas Beraldo|185|L|N|short|0|n
Oscar Bobb|170|F|B|short|0|s
Pedro Neto|173|T|N|short|1|s
Riccardo Calafiori|186|F|N|short|1|n
Rico Lewis|171|M|K|short|0|s
Rodrigo Muniz|185|L|N|short|0|n
Rui Silva|187|F|B|short|0|n
Samu Omorodion|193|T|N|short|0|w
Sean Longstaff|180|F|B|short|0|w
Vitaliy Mykolenko|180|F|B|short|0|w
Adam Wharton|178|F|G|short|0|s
Amad Diallo|173|D|K|curly|0|s
Brahim Díaz|168|T|N|short|0|s
Fermín López|174|F|N|short|0|s
Fran García|167|F|N|short|0|s
Jarell Quansah|193|M|K|short|0|w
Jean-Philippe Mateta|192|D|K|short|0|w
Levi Colwill|187|F|B|short|0|n
Malo Gusto|181|M|G|short|0|s
Manuel Ugarte|182|T|N|short|0|n
Marc Casadó|173|F|N|short|0|s
Marc Guéhi|183|M|K|short|0|n
Noni Madueke|182|M|K|short|0|n
Noussair Mazraoui|180|T|N|short|1|s
Roméo Lavia|181|M|K|short|0|n
Tyrick Mitchell|178|M|K|short|0|w
Brian Brobbey|185|D|K|short|0|w
Jamie Gittens|178|M|G|short|0|s
Johan Bakayoko|185|M|K|short|0|n
Karim Adeyemi|180|M|K|short|0|s
Kenan Yıldız|185|F|N|short|0|n
Matías Soulé|182|F|N|short|0|s
Maximilian Beier|183|F|B|short|0|n
Santiago Giménez|178|T|N|short|1|n
Yan Couto|174|L|K|short|0|s
Archie Gray|188|F|D|short|0|n
Jorrel Hato|182|M|K|short|0|n
Lucas Bergvall|187|F|G|short|0|n
Wilson Odobert|180|D|K|short|0|s
Jhon Durán|185|M|K|short|0|w
Liam Delap|186|F|B|short|0|w
Morgan Rogers|187|M|K|short|0|w
Omari Hutchinson|175|M|G|short|0|s
Ethan Nwaneri|178|M|K|short|0|s
Myles Lewis-Skelly|179|M|K|curly|0|n
Paulo Dybala||F|D|short|0|n
Jack Grealish||P|B|slick|0|n
Phil Foden||P|L|short|0|s
Gavi||F|B|curly|0|s
Bernardo Silva||L|N|short|1|s
Casemiro||T|K|bald|0|w
Romelu Lukaku|191|D|K|short|0|w
Wilfried Zaha||D|K|short|0|s
Luis Suárez||T|Y|short|-|w
Kaoru Mitoma||F|K|short|0|s
Ivan Perišić||F|S|short|0|n
Mateo Kovačić||F|N|short|0|n
Stanislav Lobotka|170|F|N|bun|0|s
Trent Alexander-Arnold||T|N|curly|0|n
Reece James|182|M|K|short|0|w
Alejandro Grimaldo|171|L|N|short|1|s
Yann Sommer|183|F|G|short|0|n
David Raya||F|N|short|1|s
Péter Gulácsi||F|N|short|0|n
Édouard Mendy||D|K|short|0|n
Mile Svilar||F|N|short|0|s
Yan Diomandé|180|X|K|dreads|0|s
Rayan Cherki|177|O|K|curly|0|s
Ferran Torres|184|F|N|short|1|n
Sadio Mané|175|X|K|short|1|s
Julián Quiñones|177|O|K|short|1|n
Dominik Szoboszlai|186|F|N|short|0|n
Marc Cucurella|172|L|N|curly|2|n
Jérémy Doku|171|D|K|short|0|s
Alejandro Balde|175|D|K|short|0|s
Rodrygo|174|M|K|short|0|s
Eduardo Camavinga|182|D|K|fade|0|n
Federico Chiesa|175|F|N|short|1|n
Rúben Neves|180|F|N|short|1|n
Sergej Milinković-Savić|191|F|N|short|1|w
Kalidou Koulibaly|187|X|K|fade|1|w
Cody Gakpo|189|M|K|fade|1|n
Kai Havertz|193|F|B|short|0|s
Leandro Trossard|172|F|L|short|1|s
Jurriën Timber|179|T|N|fade|0|n
Eberechi Eze|178|D|K|fade|0|n
Mohammed Kudus|177|D|K|short|0|n
Dejan Kulusevski|186|F|L|short|0|n
Cristian Romero|185|T|N|short|1|w
Khéphren Thuram|192|M|K|fade|0|w
Gianluca Scamacca|195|F|N|short|1|w
Mateo Retegui|186|F|N|short|1|w
Matteo Politano|171|F|N|short|1|n
Alex Meret|190|F|N|short|0|n
Pierre Kalulu|184|D|K|fade|0|n
Hiroki Ito|188|L|K|short|0|n
Waldemar Anton|189|F|B|short|1|w
Emre Can|186|F|N|short|2|w
Benjamin Šeško|195|F|B|short|0|w
Matheus Cunha|184|T|N|short|1|n
Senne Lammens|197|F|L|short|0|n
Nick Woltemade|197|F|D|short|0|n
Lewis Hall|182|L|N|short|0|n
Yankuba Minteh|175|D|K|short|0|s
Ezri Konsa|183|M|K|short|1|n
Amadou Onana|195|D|K|fade|0|w
Ismaïla Sarr|185|D|K|short|1|n
Igor Thiago|192|M|K|short|1|w
Amine Gouiri|181|O|K|short|1|n
Folarin Balogun|183|M|K|fade|0|n
Georges Mikautadze|184|F|N|short|1|n
Warren Zaïre-Emery|178|M|K|short|0|s
Matvey Safonov|190|F|L|short|0|n
Ronald Araújo|188|M|K|short|0|w
Wojciech Szczęsny|195|F|B|short|2|w
Álvaro Carreras|178|F|N|short|0|n
Giuliano Simeone|175|T|N|short|1|n
Piotr Zieliński|180|F|L|short|0|n
Francesco Pio Esposito|188|F|N|short|0|w
`;
  RUT.REAL = RUT.REAL || {}; RUT.HEIGHTS = RUT.HEIGHTS || {};
  T.trim().split('\n').forEach(line => {
    const f = line.split('|'); if (f.length < 7) return;
    const name = f[0].trim(), x = RUT.REAL[name] = Object.assign({}, RUT.REAL[name]);
    if (+f[1]) RUT.HEIGHTS[name] = +f[1];
    if (SKIN[f[2]]) x.skin = SKIN[f[2]];
    if (HAIR[f[3]]) x.hair = HAIR[f[3]];
    if (f[4] !== '-') { x.style = f[4]; if (f[4] === 'bald') x.bald = true; }
    if (f[5] === '0') { x.beard = false; x.full = false; } else if (f[5] === '1') { x.beard = true; x.full = false; } else if (f[5] === '2') { x.beard = true; x.full = true; }
    if (BUILD[f[6]]) x.bw = BUILD[f[6]];
  });
  // heights go onto the database cards (card pages, the pixel figure's size and the 3D model all read details.height)
  if (RUT.DB && RUT.DB.all) RUT.DB.all.forEach(c => { const h = RUT.HEIGHTS[c.name]; if (h && c.details) c.details.height = h; });
})();
