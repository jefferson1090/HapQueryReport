
import * as ReactWindow from 'react-window';
console.log('Keys:', Object.keys(ReactWindow));
try { console.log('FixedSizeList:', ReactWindow.FixedSizeList); } catch (e) { }
try { console.log('Default:', ReactWindow.default); } catch (e) { }
try { console.log('Default.FixedSizeList:', ReactWindow.default?.FixedSizeList); } catch (e) { }
