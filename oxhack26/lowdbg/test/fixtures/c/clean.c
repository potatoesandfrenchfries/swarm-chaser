#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    char *s = malloc(16);
    if (!s) return 1;
    strncpy(s, "all good", 15);
    s[15] = '\0';
    printf("%s\n", s);
    free(s);
    return 0;
}
