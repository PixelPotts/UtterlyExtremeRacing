#include <gme/gme.h>
#include <stdio.h>
#include <stdlib.h>

#define SAMPLE_RATE 44100
#define CHANNELS    2
#define DURATION_S  200

int main(int argc, char* argv[]) {
    if (argc < 3) { fprintf(stderr, "Usage: %s in.nsf out.wav [track]\n", argv[0]); return 1; }
    int track = argc > 3 ? atoi(argv[3]) : 0;

    Music_Emu* emu;
    gme_err_t err = gme_open_file(argv[1], &emu, SAMPLE_RATE);
    if (err) { fprintf(stderr, "gme_open_file: %s\n", err); return 1; }

    printf("Tracks available: %d\n", gme_track_count(emu));
    err = gme_start_track(emu, track);
    if (err) { fprintf(stderr, "gme_start_track: %s\n", err); return 1; }

    long total = (long)SAMPLE_RATE * CHANNELS * DURATION_S;
    short* buf = malloc(total * sizeof(short));
    if (!buf) { fprintf(stderr, "OOM\n"); return 1; }

    err = gme_play(emu, (int)total, buf);
    if (err) fprintf(stderr, "gme_play warning: %s\n", err);

    FILE* f = fopen(argv[2], "wb");
    if (!f) { fprintf(stderr, "Cannot write %s\n", argv[2]); return 1; }

    int data_bytes = (int)(total * sizeof(short));
    // WAV header
    fwrite("RIFF", 1, 4, f);
    int riff_sz = data_bytes + 36; fwrite(&riff_sz, 4, 1, f);
    fwrite("WAVE", 1, 4, f);
    fwrite("fmt ", 1, 4, f);
    int fmt_sz = 16; fwrite(&fmt_sz, 4, 1, f);
    short pcm = 1;    fwrite(&pcm, 2, 1, f);
    short ch = CHANNELS; fwrite(&ch, 2, 1, f);
    int sr = SAMPLE_RATE; fwrite(&sr, 4, 1, f);
    int br = SAMPLE_RATE * CHANNELS * 2; fwrite(&br, 4, 1, f);
    short ba = CHANNELS * 2; fwrite(&ba, 2, 1, f);
    short bps = 16; fwrite(&bps, 2, 1, f);
    fwrite("data", 1, 4, f);
    fwrite(&data_bytes, 4, 1, f);
    fwrite(buf, sizeof(short), total, f);
    fclose(f);

    free(buf);
    gme_delete(emu);
    printf("Wrote %d seconds → %s\n", DURATION_S, argv[2]);
    return 0;
}
