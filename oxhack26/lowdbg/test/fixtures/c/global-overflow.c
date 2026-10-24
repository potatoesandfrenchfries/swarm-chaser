#include <stdio.h>

static int table[8];

int main(int argc, char **argv) {
    (void)argv;
    table[argc + 7] = 1; // BUG
    printf("%d\n", table[0]);
    return 0;
}
