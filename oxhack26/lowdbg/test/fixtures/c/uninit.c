#include <stdio.h>

int main(int argc, char **argv) {
    (void)argv;
    int total;
    if (argc > 5) total = 10;
    printf("%d\n", total + 1); // BUG
    return 0;
}
