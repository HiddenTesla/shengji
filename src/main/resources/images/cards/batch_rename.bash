#!/bin/bash

for file in $(find ${PWD} -maxdepth 1 -mindepth 1 -name "*.png") ; do
    # get pure name, without path
    pure_name=${file##*/}

    # rule applies only to filename which starts with 1-2 digits plus .png
    if [ $(echo ${pure_name} | grep -cE '^[0-9]{1,2}\.png') -gt 0 ]; then
        number=${pure_name%%.*}
        let quotient=${number}/13
        let remains=${number}%13

        suit=""
        if [ ${quotient} -eq 0 ]; then
            suit="heart"
        elif [ ${quotient} -eq 1 ]; then
            suit="spade"
        elif [ ${quotient} -eq 2 ]; then
            suit="diamond"
        elif [ ${quotient} -eq 3 ]; then
            suit="club"
        fi

        rank=""
        if [ ${remains} -le 8 ]; then
            let rank="${remains}+2"
        elif [ ${remains} -eq 9 ]; then
            rank="J"
        elif [ ${remains} -eq 10 ]; then
            rank="Q"
        elif [ ${remains} -eq 11 ]; then
            rank="K"
        elif [ ${remains} -eq 12 ]; then
            rank="A"
        fi

        new_file_name=""
        if [ "X${suit}" != "X" ]; then
            new_file_name="${suit}_${rank}"
        elif [ ${number} -eq 52 ]; then
            new_file_name="small_joker"
        elif [ ${number} -eq 53 ]; then
            new_file_name="big_joker"
        fi

        new_file_name="${new_file_name}.png"

        mv ${pure_name} ${new_file_name}
    fi
done