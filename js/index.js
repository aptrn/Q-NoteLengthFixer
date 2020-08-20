let fs = require('fs');
const path = require('path');
const Max = require('max-api');
let MIDIFile = require('midifile');
let MIDIEvents = require('midievents');

var outPath;
var inPath;
var minimumGap = 1;             //in millisecondi

Max.addHandler("bang", () => {
    Max.post("Starting");
    go();
    Max.post("Done!");
});

Max.addHandler("inputPath", (msg) => {
	inPath = msg;
    Max.post("Input Path = " + inPath);
});

Max.addHandler("outputPath", (msg) => {
    outPath = msg;
    Max.post("Output Path = " + outPath);
});

Max.addHandler("gap", (int) => {
    minimumGap = int;
    Max.post("Detection gap = " + minimumGap);
});


function go(){
    fs.readdirSync(inPath).forEach(file => {
    	if (path.extname(file) === ".mid" || path.extname(file) === ".MID"){
            Max.post("Processing " + file);
            var newFile = new MIDIFile();
            var newEvents;
            var count = 0;

            var data = fs.readFileSync(inPath + file);
            var midiFile = new MIDIFile(toArrayBuffer(data));
            newFile.header = midiFile.header;

            var msPerTick = 60000 / (midiFile.header.getTicksPerBeat() * 120);       //60000 / (BPM * PPQ) 
            var ticksGap = Math.round(minimumGap / msPerTick);

            for (var t = 0; t < midiFile.tracks.length; t++){                            //per tutte le tracce
                newFile.addTrack(t);
                var events = midiFile.getTrackEvents(t);
                var spostato = [];
                for (var i = 0; i < events.length; i++) {
                    spostato[i] = false;
                }
                var startNote = 0;
                for(var e = 0; e < events.length - 1; e++){                 //per tutti gli eventi
                    if(events[e].type === MIDIEvents.EVENT_MIDI){
                        if (events[e].subtype ===  MIDIEvents.EVENT_MIDI_NOTE_ON && events[e].delta < ticksGap){
                            startNote++;
                        }
                        else{
                            break;
                        }
                    }
                    else{
                        continue;
                    }
                }
                if (startNote < 1) startNote = 1;
                for(var e = startNote; e < events.length; e++){                 //per tutti gli eventi
                    if(events[e].type === MIDIEvents.EVENT_MIDI){
                        if (events[e].subtype ===  MIDIEvents.EVENT_MIDI_NOTE_ON){                               //se è note ON
                            var n = events[e].param1;
                            if(events[e].delta < ticksGap){
                                for(var k = e - 1; k > 0; k--){                 //per tutti gli eventi precedenti
                                   
                                    if (events[k].param1 == n && events[k].subtype ===  MIDIEvents.EVENT_MIDI_NOTE_OFF){  //se l'evento precedente è note off ed è della stessa nota
                                        count++;
                                        var difference = ticksGap;
                                        if(events[k].delta >= difference){
                                            //console.log("ok! index: " + parseInt(events[k].index) + " note: " + events[k].param1)
                                            events[k].delta = (events[k].delta) - difference;
                                            spostato[k] = true;
                                            for(var d = k + 1; d < events.length; d++){
                                                if (events[d].delta > ticksGap){
                                                    break;
                                                }
                                                else {
                                                    if(spostato[d] == true) continue;
                                                    else{
                                                        events[d].delta = (difference) + events[d].delta;
                                                        //if (events[d].subtype ===  MIDIEvents.EVENT_MIDI_NOTE_OFF) e--;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                        else {
                                            var sum = 0;
                                            var lastdelta = events[k].delta;
                                            for(var d = k; d > 0; d--){
                                                if(events[d].delta >= difference && spostato[d] == false){
                                                    events[k].delta = events[d].delta - difference;
                                                    events[k].index = events[d].index;
                                                    events[d].delta = difference;
                                                    events[k + 1].delta += lastdelta;
                                                    for(var j = d; j < k; j++){
                                                        events[j].index++;
                                                    }
                                                    //if (events[d].param1 == n && events[d].subtype ===  MIDIEvents.EVENT_MIDI_NOTE_ON) console.log("ERROR!")
                                                    if (events[d].param1 == n && events[d].subtype ===  MIDIEvents.EVENT_MIDI_NOTE_ON) Max.post("ERROR!")
                                                    
                                                    d = 0;
                                                    break;
                                                }
                                                else{
                                                    sum += events[d].delta;
                                                    //if (events[d].param1 == n && events[d].subtype ===  MIDIEvents.EVENT_MIDI_NOTE_ON) console.log("probabilmente c'è un errore")
                                                    if (events[d].param1 == n && events[d].subtype ===  MIDIEvents.EVENT_MIDI_NOTE_ON) Max.post("probabilmente c'è un errore")
                                                    continue;
                                                }
                                            }
                                            //console.log("NONE! index: " + parseInt(events[e].index) + " note: " + events[e].param1)
                                            events.sort(sort_by('index', false, parseInt));
                                            //for(var x = 0; x < events.length; x++) console.log("index: " + parseInt(events[x].index) + " note: " + events[x].param1);
                                            //console.log(events);
                                        }
                                        k = 0;
                                        break;
                                    }
                                    else if(events[k].delta < ticksGap){                  //se anche questa ha il delta 0 prova ancora
                                        continue;
                                    }
                                    else{                                                            //altrimenti non c'è male
                                        k = 0;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    else{ }
                }
                newEvents = JSON.parse(JSON.stringify(events));

                //console.log("Found " + count + " problematic notes");    
                Max.post("Found " + count + " problematic notes");    
                newFile.setTrackEvents(t, newEvents);
            }
            const chunk = newFile.getContent();
            fs.appendFile(outPath + "fixed_" + minimumGap + "ms_" + path.basename(file) , Buffer.from(chunk), function (err) {});
            Max.post("Wrote to: " + outPath + "fixed_"  + minimumGap + "ms_"+ path.basename(file));
        
    	}
    	else{
    	}
    });
}




function toArrayBuffer(buffer) {
    var ab = new ArrayBuffer(buffer.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        view[i] = buffer[i];
    }
    return ab;
}

function compare( a, b ) {
    if ( a.index < b.index ){
      return -1;
    }
    if ( a.index > b.index ){
      return 1;
    }
    return 0;
}

const sort_by = (field, reverse, primer) => {

    const key = primer ?
      function(x) {
        return primer(x[field])
      } :
      function(x) {
        return x[field]
      };
  
    reverse = !reverse ? 1 : -1;
  
    return function(a, b) {
      return a = key(a), b = key(b), reverse * ((a > b) - (b > a));
    }
  }